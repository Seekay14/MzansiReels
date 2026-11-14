const crypto = require('crypto');
const {
  Account,
  Client,
  Databases,
  ID,
  Permission,
  Query,
  Role,
  Storage,
} = require('node-appwrite');

const PAGE_SIZE = 100;
const MESSAGE_TYPES = new Set(['text', 'image', 'video', 'audio', 'sticker']);
const FILE_ID_PATTERN = /^\/storage\/buckets\/([^/]+)\/files\/([^/]+)\/view$/;

function getParticipantIds(value) {
  let participants = value;
  if (typeof value === 'string') {
    const serialized = value.trim();
    if (!serialized) return [];
    try {
      participants = JSON.parse(serialized);
    } catch {
      participants = serialized.split(',');
    }
  }
  if (typeof participants === 'string') participants = participants.split(',');
  if (!Array.isArray(participants)) return [];
  return [...new Set(participants
    .filter((participantId) => typeof participantId === 'string')
    .map((participantId) => participantId.trim())
    .filter(Boolean))];
}

function parseBody(body) {
  if (typeof body !== 'string') return body || {};
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function getUserJwt(req) {
  const headers = req.headers || {};
  return headers['user-jwt'] || headers['x-appwrite-user-jwt'] || headers['X-Appwrite-User-JWT'];
}

function getConversationId(firstUserId, secondUserId) {
  const key = [firstUserId, secondUserId].sort().join(':');
  const seeds = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35];

  return seeds.map((seed) => {
    let hash = seed;
    for (let index = 0; index < key.length; index += 1) {
      hash = Math.imul(hash ^ key.charCodeAt(index), 0x01000193);
    }
    hash ^= hash >>> 16;
    hash = Math.imul(hash, 0x7feb352d);
    hash ^= hash >>> 15;
    hash = Math.imul(hash, 0x846ca68b);
    hash ^= hash >>> 16;
    return (hash >>> 0).toString(16).padStart(8, '0');
  }).join('');
}

function isParticipantPair(chat, firstUserId, secondUserId) {
  const participants = getParticipantIds(chat?.participants);
  return participants.length === 2
    && participants.includes(firstUserId)
    && participants.includes(secondUserId);
}

function getChatPermissions(firstUserId, secondUserId) {
  return [
    Permission.read(Role.user(firstUserId)),
    Permission.read(Role.user(secondUserId)),
    Permission.delete(Role.user(firstUserId)),
    Permission.delete(Role.user(secondUserId)),
  ];
}

async function ensureChatPermissions(
  databases,
  databaseId,
  chatsCollectionId,
  chat,
  firstUserId,
  secondUserId,
) {
  const permissions = getChatPermissions(firstUserId, secondUserId);
  const currentPermissions = chat.$permissions || [];
  if (
    currentPermissions.length === permissions.length
    && permissions.every((permission) => currentPermissions.includes(permission))
  ) {
    return chat;
  }
  return databases.updateDocument(
    databaseId,
    chatsCollectionId,
    chat.$id,
    {},
    permissions,
  );
}

async function assertNoBlock(databases, databaseId, blocksCollectionId, firstUserId, secondUserId) {
  const [firstBlock, secondBlock] = await Promise.all([
    databases.listDocuments(databaseId, blocksCollectionId, [
      Query.equal('blockerId', firstUserId),
      Query.equal('blockedId', secondUserId),
      Query.limit(1),
    ]),
    databases.listDocuments(databaseId, blocksCollectionId, [
      Query.equal('blockerId', secondUserId),
      Query.equal('blockedId', firstUserId),
      Query.limit(1),
    ]),
  ]);
  if (firstBlock.documents.length || secondBlock.documents.length) {
    const error = new Error('Messaging is unavailable because one participant has blocked the other.');
    error.statusCode = 403;
    throw error;
  }
}

async function assertActiveRecipient(databases, databaseId, usersCollectionId, receiverId) {
  const result = await databases.listDocuments(databaseId, usersCollectionId, [
    Query.equal('userId', receiverId),
    Query.limit(1),
  ]);
  const profile = result.documents.find((document) => document.userId === receiverId);
  if (!profile || profile.isDeactivated === true) {
    const error = new Error(
      profile
        ? 'This recipient account is deactivated and cannot receive new conversations.'
        : 'This recipient does not have an active MzansiReels profile.',
    );
    error.statusCode = 404;
    throw error;
  }
}

async function findExistingChat(databases, databaseId, chatsCollectionId, firstUserId, secondUserId) {
  let offset = 0;
  while (true) {
    const page = await databases.listDocuments(databaseId, chatsCollectionId, [
      Query.contains('participants', firstUserId),
      Query.orderDesc('updatedAt'),
      Query.limit(PAGE_SIZE),
      Query.offset(offset),
    ]);
    const chat = page.documents.find((document) => (
      isParticipantPair(document, firstUserId, secondUserId)
    ));
    if (chat) return chat;
    offset += page.documents.length;
    if (!page.documents.length || offset >= page.total) return null;
  }
}

async function getOrCreateChat(
  databases,
  databaseId,
  chatsCollectionId,
  usersCollectionId,
  firstUserId,
  secondUserId,
) {
  const existing = await findExistingChat(
    databases,
    databaseId,
    chatsCollectionId,
    firstUserId,
    secondUserId,
  );
  if (existing) {
    const chat = await ensureChatPermissions(
      databases,
      databaseId,
      chatsCollectionId,
      existing,
      firstUserId,
      secondUserId,
    );
    return { chat, created: false };
  }

  await assertActiveRecipient(databases, databaseId, usersCollectionId, secondUserId);
  const chatId = getConversationId(firstUserId, secondUserId);
  try {
    const chat = await databases.createDocument(
      databaseId,
      chatsCollectionId,
      chatId,
      {
        participants: JSON.stringify([firstUserId, secondUserId].sort()),
        lastMessage: '',
        updatedAt: new Date().toISOString(),
      },
      getChatPermissions(firstUserId, secondUserId),
    );
    return { chat, created: true };
  } catch (error) {
    if (error.code !== 409 && error.type !== 'document_already_exists') throw error;
    const chat = await databases.getDocument(databaseId, chatsCollectionId, chatId);
    if (!isParticipantPair(chat, firstUserId, secondUserId)) {
      throw new Error('The existing conversation does not match these participants.');
    }
    return {
      chat: await ensureChatPermissions(
        databases,
        databaseId,
        chatsCollectionId,
        chat,
        firstUserId,
        secondUserId,
      ),
      created: false,
    };
  }
}

async function getVerifiedChat(databases, databaseId, chatsCollectionId, chatId, senderId, receiverId) {
  const chat = await databases.getDocument(databaseId, chatsCollectionId, chatId);
  if (!isParticipantPair(chat, senderId, receiverId)) {
    const error = new Error('You are not a participant in this conversation.');
    error.statusCode = 403;
    throw error;
  }
  return ensureChatPermissions(
    databases,
    databaseId,
    chatsCollectionId,
    chat,
    senderId,
    receiverId,
  );
}

async function grantMessageAttachment(
  storage,
  endpoint,
  bucketId,
  fileUrl,
  senderId,
  receiverId,
) {
  let parsedUrl;
  try {
    parsedUrl = new URL(fileUrl);
  } catch {
    throw new Error('The attachment URL is invalid.');
  }
  const endpointUrl = new URL(endpoint);
  const endpointPath = endpointUrl.pathname.replace(/\/$/, '');
  if (parsedUrl.origin !== endpointUrl.origin || !parsedUrl.pathname.startsWith(`${endpointPath}/`)) {
    throw new Error('Message attachments must be stored in this Appwrite project.');
  }
  const filePath = parsedUrl.pathname.slice(endpointPath.length);
  const match = FILE_ID_PATTERN.exec(filePath);
  if (!match || match[1] !== bucketId) {
    throw new Error('The attachment does not belong to the configured message storage bucket.');
  }
  const fileId = decodeURIComponent(match[2]);
  const file = await storage.getFile(bucketId, fileId);
  const senderUpdatePermission = Permission.update(Role.user(senderId));
  if (!file.$permissions?.includes(senderUpdatePermission)) {
    const error = new Error('You can only send files uploaded by your signed-in account.');
    error.statusCode = 403;
    throw error;
  }

  return storage.updateFile(bucketId, fileId, file.name, [
    Permission.read(Role.user(senderId)),
    Permission.read(Role.user(receiverId)),
    Permission.update(Role.user(senderId)),
    Permission.delete(Role.user(senderId)),
  ]);
}

async function findTypingDocument(databases, databaseId, typingCollectionId, chatId, userId) {
  const result = await databases.listDocuments(databaseId, typingCollectionId, [
    Query.equal('chatId', chatId),
    Query.equal('userId', userId),
    Query.limit(1),
  ]);
  return result.documents[0] || null;
}

async function updateTypingStatus(
  databases,
  databaseId,
  typingCollectionId,
  chat,
  userId,
  isTyping,
) {
  const otherUserId = getParticipantIds(chat.participants)
    .find((participantId) => participantId !== userId);
  if (!otherUserId) throw new Error('The conversation participants are invalid.');
  const permissions = [
    Permission.read(Role.user(otherUserId)),
    Permission.update(Role.user(userId)),
    Permission.delete(Role.user(userId)),
  ];
  const existing = await findTypingDocument(
    databases,
    databaseId,
    typingCollectionId,
    chat.$id,
    userId,
  );
  if (existing) {
    return databases.updateDocument(
      databaseId,
      typingCollectionId,
      existing.$id,
      { isTyping },
      permissions,
    );
  }
  if (!isTyping) return null;

  const documentId = crypto
    .createHash('sha256')
    .update(`${chat.$id}:${userId}`)
    .digest('hex')
    .slice(0, 32);
  try {
    return await databases.createDocument(
      databaseId,
      typingCollectionId,
      documentId,
      { chatId: chat.$id, userId, isTyping: true },
      permissions,
    );
  } catch (error) {
    if (error.code !== 409 && error.type !== 'document_already_exists') throw error;
    return databases.updateDocument(
      databaseId,
      typingCollectionId,
      documentId,
      { isTyping: true },
      permissions,
    );
  }
}

module.exports = async function (req, res) {
  if (res === undefined && req && req.req && req.res) {
    ({ req, res } = req);
  }

  const environment = {
    endpoint: process.env.APPWRITE_ENDPOINT,
    projectId: process.env.APPWRITE_PROJECT_ID,
    apiKey: process.env.APPWRITE_API_KEY,
    databaseId: process.env.DATABASE_ID,
    usersCollectionId: process.env.USERS_COLLECTION_ID,
    chatsCollectionId: process.env.CHATS_COLLECTION_ID,
    messagesCollectionId: process.env.MESSAGES_COLLECTION_ID,
    blocksCollectionId: process.env.BLOCKS_COLLECTION_ID,
    typingCollectionId: process.env.TYPING_COLLECTION_ID,
    bucketId: process.env.STORAGE_BUCKET_ID,
  };
  const missing = Object.entries(environment)
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length) {
    return res.json({ success: false, error: `Missing environment variables: ${missing.join(', ')}` }, 500);
  }

  const userJwt = getUserJwt(req);
  const body = parseBody(req.bodyJson ?? req.body ?? req.payload);
  if (!userJwt || !body || typeof body.action !== 'string') {
    return res.json({ success: false, error: 'A signed-in user and valid action are required.' }, 400);
  }

  let createdChatId = null;
  let messageSaved = false;
  try {
    const userClient = new Client()
      .setEndpoint(environment.endpoint)
      .setProject(environment.projectId)
      .setJWT(userJwt);
    const authenticatedUser = await new Account(userClient).get();
    const senderId = authenticatedUser.$id;
    const adminClient = new Client()
      .setEndpoint(environment.endpoint)
      .setProject(environment.projectId)
      .setKey(environment.apiKey);
    const databases = new Databases(adminClient);
    const storage = new Storage(adminClient);

    if (body.action === 'typing') {
      if (typeof body.chatId !== 'string' || typeof body.isTyping !== 'boolean') {
        return res.json({ success: false, error: 'A valid chat and typing state are required.' }, 400);
      }
      const chat = await databases.getDocument(
        environment.databaseId,
        environment.chatsCollectionId,
        body.chatId,
      );
      const participants = getParticipantIds(chat.participants);
      if (participants.length !== 2 || !participants.includes(senderId)) {
        return res.json({ success: false, error: 'You are not a participant in this conversation.' }, 403);
      }
      const otherUserId = participants.find((participantId) => participantId !== senderId);
      await assertNoBlock(
        databases,
        environment.databaseId,
        environment.blocksCollectionId,
        senderId,
        otherUserId,
      );
      const document = await updateTypingStatus(
        databases,
        environment.databaseId,
        environment.typingCollectionId,
        chat,
        senderId,
        body.isTyping,
      );
      return res.json({ success: true, document });
    }

    if (body.action === 'mark_read') {
      const messageIds = [...new Set(
        Array.isArray(body.messageIds)
          ? body.messageIds.filter((messageId) => typeof messageId === 'string').slice(0, PAGE_SIZE)
          : [],
      )];
      const updatedIds = [];
      for (const messageId of messageIds) {
        const message = await databases.getDocument(
          environment.databaseId,
          environment.messagesCollectionId,
          messageId,
        );
        if (message.receiverId !== senderId) {
          return res.json({ success: false, error: 'Only the recipient can mark a message as read.' }, 403);
        }
        if (message.isRead !== true) {
          await databases.updateDocument(
            environment.databaseId,
            environment.messagesCollectionId,
            messageId,
            { isRead: true },
          );
        }
        updatedIds.push(messageId);
      }
      return res.json({ success: true, messageIds: updatedIds });
    }

    if (body.action === 'react') {
      if (
        typeof body.messageId !== 'string'
        || typeof body.reaction !== 'string'
        || body.reaction.length > 32
      ) {
        return res.json({ success: false, error: 'A valid message and reaction are required.' }, 400);
      }
      const message = await databases.getDocument(
        environment.databaseId,
        environment.messagesCollectionId,
        body.messageId,
      );
      if (message.senderId !== senderId && message.receiverId !== senderId) {
        return res.json({ success: false, error: 'You are not a participant in this message.' }, 403);
      }
      const updated = await databases.updateDocument(
        environment.databaseId,
        environment.messagesCollectionId,
        body.messageId,
        { reactions: body.reaction },
      );
      return res.json({ success: true, message: updated });
    }

    if (body.action !== 'send' && body.action !== 'get_or_create_chat') {
      return res.json({ success: false, error: 'Unsupported messaging action.' }, 400);
    }
    const receiverId = body.receiverId;
    if (
      typeof receiverId !== 'string'
      || !receiverId
      || receiverId === senderId
    ) {
      return res.json({ success: false, error: 'This user is unavailable.' }, 404);
    }
    if (body.chatId !== undefined && body.chatId !== '' && typeof body.chatId !== 'string') {
      return res.json({ success: false, error: 'A valid conversation is required.' }, 400);
    }
    await assertNoBlock(
      databases,
      environment.databaseId,
      environment.blocksCollectionId,
      senderId,
      receiverId,
    );
    await assertActiveRecipient(
      databases,
      environment.databaseId,
      environment.usersCollectionId,
      receiverId,
    );

    const text = typeof body.text === 'string' ? body.text : '';
    const attachmentUrl = typeof body.attachmentUrl === 'string' ? body.attachmentUrl : '';
    const stickerUrl = typeof body.stickerUrl === 'string' ? body.stickerUrl : '';
    const replyToId = typeof body.replyToId === 'string' ? body.replyToId : '';
    const attachmentType = body.attachmentType || 'text';
    if (body.action === 'send') {
      if (!MESSAGE_TYPES.has(attachmentType)) {
        return res.json({ success: false, error: 'Unsupported message type.' }, 400);
      }
      if (text.length > 4000 || replyToId.length > 36) {
        return res.json({ success: false, error: 'Message content exceeds the allowed length.' }, 400);
      }
      if (
        (attachmentType === 'text' && !text.trim())
        || (['image', 'video', 'audio'].includes(attachmentType) && !attachmentUrl)
        || (attachmentType === 'sticker' && !stickerUrl)
      ) {
        return res.json({ success: false, error: 'Message text or a valid attachment is required.' }, 400);
      }
    }

    let chat;
    let chatWasCreated = false;
    if (body.chatId) {
      chat = await getVerifiedChat(
        databases,
        environment.databaseId,
        environment.chatsCollectionId,
        body.chatId,
        senderId,
        receiverId,
      );
    } else {
      const result = await getOrCreateChat(
        databases,
        environment.databaseId,
        environment.chatsCollectionId,
        environment.usersCollectionId,
        senderId,
        receiverId,
      );
      chat = result.chat;
      chatWasCreated = result.created;
      if (chatWasCreated) createdChatId = chat.$id;
    }

    if (body.action === 'get_or_create_chat') {
      return res.json({ success: true, chat });
    }

    if (['image', 'video', 'audio'].includes(attachmentType)) {
      await grantMessageAttachment(
        storage,
        environment.endpoint,
        environment.bucketId,
        attachmentUrl,
        senderId,
        receiverId,
      );
    }

    const messagePermissions = [
      Permission.read(Role.user(senderId)),
      Permission.read(Role.user(receiverId)),
      Permission.update(Role.user(senderId)),
      Permission.delete(Role.user(senderId)),
    ];
    let message;
    try {
      message = await databases.createDocument(
        environment.databaseId,
        environment.messagesCollectionId,
        ID.unique(),
        {
          senderId,
          receiverId,
          text,
          isRead: false,
          reactions: '',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          attachmentUrl,
          chatId: chat.$id,
          attachmentType,
          stickerUrl,
          replyToId,
        },
        messagePermissions,
      );
      messageSaved = true;
    } catch (error) {
      error.collectionId = environment.messagesCollectionId;
      throw error;
    }

    try {
      const updatedChat = await databases.updateDocument(
        environment.databaseId,
        environment.chatsCollectionId,
        chat.$id,
        {
          lastMessage: (text || (attachmentType === 'sticker' ? 'Sticker' : 'Media')).slice(0, 100),
          updatedAt: new Date().toISOString(),
        },
      );
      chat = { ...chat, ...updatedChat };
    } catch (error) {
      console.error('Message saved, but chat preview update failed:', {
        chatId: chat.$id,
        code: error.code,
        message: error.message,
      });
    }

    console.log('Appwrite message saved:', {
      messageId: message.$id,
      chatId: chat.$id,
      senderId,
      receiverId,
    });
    return res.json({ success: true, chat, message });
  } catch (error) {
    if (createdChatId && !messageSaved) {
      try {
        await new Databases(new Client()
          .setEndpoint(environment.endpoint)
          .setProject(environment.projectId)
          .setKey(environment.apiKey))
          .deleteDocument(environment.databaseId, environment.chatsCollectionId, createdChatId);
      } catch (cleanupError) {
        console.error('Could not remove empty chat after failed send:', {
          chatId: createdChatId,
          code: cleanupError.code,
          message: cleanupError.message,
        });
      }
    }
    console.error('Messaging function failed:', {
      action: body.action,
      collectionId: error.collectionId,
      code: error.code,
      type: error.type,
      message: error.message,
    });
    return res.json(
      { success: false, error: error.message || 'The messaging request failed.' },
      error.statusCode || (error.code === 404 ? 404 : 500),
    );
  }
};
