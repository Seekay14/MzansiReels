const { Client, Databases } = require('node-appwrite');

module.exports = async function (context) {
  // 1. Initialize Client
  const client = new Client()
    .setEndpoint(process.env.endpoint || 'https://cloud.appwrite.io/v1')
    .setProject(process.env.projectId)
    .setKey(process.env.APPWRITE_API_KEY);

  const databases = new Databases(client);

  try {
    // 2. Extract the body robustly
    let payload = {};
    const rawBody = context.req.body || context.req.payload;

    if (rawBody) {
      if (typeof rawBody === 'string') {
        payload = JSON.parse(rawBody);
      } else {
        payload = rawBody;
      }
    }

    const { senderId, receiverId, chatId, text } = payload;

    if (!senderId || !receiverId || !chatId) {
      return context.res.json({ 
        success: false, 
        message: "Missing required fields", 
        receivedPayload: payload 
      });
    }

    // 3. Create the message (UPDATED DATABASE ID)
    const message = await databases.createDocument(
      '6af0bc84001abbbcb856', // YOUR ACTUAL DATABASE ID
      '6af0c7fd002e8d46827c', // Messages Collection ID
      'unique()',
      { senderId, receiverId, chatId, text: text || "", isRead: false }
    );

    // 4. Update the chat's last message (UPDATED DATABASE ID)
    await databases.updateDocument(
      '6af0bc84001abbbcb856', // YOUR ACTUAL DATABASE ID
      '6af324010030906d4c0b', // Chats Collection ID
      chatId,
      { lastMessage: text || "", updatedAt: new Date().toISOString() }
    );

    return context.res.json({ success: true, messageId: message.$id });

  } catch (error) {
    console.error("Function Error:", error);
    return context.res.json({ success: false, error: error.message });
  }
};