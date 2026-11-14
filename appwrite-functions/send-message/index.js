const { Client, Databases } = require('node-appwrite');

module.exports = async function (req, res) {
  const client = new Client()
    .setEndpoint(process.env.endpoint || 'https://cloud.appwrite.io/v1')
    .setProject(process.env.projectId)
    .setKey(process.env.APPWRITE_API_KEY);

  const databases = new Databases(client);

  try {
    const payload = JSON.parse(req.payload);
    const { senderId, receiverId, chatId, text } = payload;

    if (!senderId || !receiverId || !chatId) {
      return res.json({ success: false, message: "Missing required fields" });
    }

    const message = await databases.createDocument(
      '6af6f481000e88922cbf', // Your Database ID
      '6af0c7fd002e8d46827c', // Your Messages Collection ID
      'unique()',
      { senderId, receiverId, chatId, text: text || "", isRead: false }
    );

    await databases.updateDocument(
      '6af6f481000e88922cbf', // Your Database ID
      '6af324010030906d4c0b', // Your Chats Collection ID
      chatId,
      { lastMessage: text || "", updatedAt: new Date().toISOString() }
    );

    return res.json({ success: true, messageId: message.$id });
  } catch (error) {
    return res.json({ success: false, error: error.message });
  }
};
