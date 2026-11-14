const { Client, Databases } = require('node-appwrite');

module.exports = async function (context) {
  // 1. Initialize Client
  const client = new Client()
    .setEndpoint(process.env.endpoint || 'https://cloud.appwrite.io/v1')
    .setProject(process.env.projectId)
    .setKey(process.env.APPWRITE_API_KEY);

  const databases = new Databases(client);

  try {
    // 2. Safely parse the payload (prevents the "Unexpected token u" error)
    const rawPayload = context.req.payload || "{}";
    const payload = JSON.parse(rawPayload);
    const { senderId, receiverId, chatId, text } = payload;

    if (!senderId || !receiverId || !chatId) {
      return context.res.json({ success: false, message: "Missing required fields: senderId, receiverId, or chatId" });
    }

    // 3. Create the message
    const message = await databases.createDocument(
      '6af6f481000e88922cbf', // Your Database ID
      '6af0c7fd002e8d46827c', // Your Messages Collection ID
      'unique()',
      { senderId, receiverId, chatId, text: text || "", isRead: false }
    );

    // 4. Update the chat's last message
    await databases.updateDocument(
      '6af6f481000e88922cbf', // Your Database ID
      '6af324010030906d4c0b', // Your Chats Collection ID
      chatId,
      { lastMessage: text || "", updatedAt: new Date().toISOString() }
    );

    // 5. Return success
    return context.res.json({ success: true, messageId: message.$id });

  } catch (error) {
    // 6. Return error
    return context.res.json({ success: false, error: error.message });
  }
};