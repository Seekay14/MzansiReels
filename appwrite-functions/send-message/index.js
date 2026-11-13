const { Client, Databases, Permission, Role } = require('node-appwrite');

module.exports = async function (req, res) {
  // 1. Initialize the Appwrite Client using the dynamic ephemeral key
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_ENDPOINT || 'https://cloud.appwrite.io/v1')
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(req.headers['x-appwrite-key']); 

  const databases = new Databases(client);

  try {
    // 2. Parse the payload sent from the React app
    const payload = JSON.parse(req.payload);
    const { senderId, receiverId, chatId, text } = payload;

    if (!senderId || !receiverId || !chatId) {
      return res.json({ success: false, message: "Missing required fields" });
    }

    // 3. Create the message document
    const message = await databases.createDocument(
      process.env.DATABASE_ID, // Pulls from your Appwrite Environment Variables
      '6af0c7fd002e8d46827c', // messages collection ID
      'unique()',
      {
        senderId,
        receiverId,
        chatId,
        text: text || "",
        isRead: false
      },
      [
        // Grant permissions to both sender and receiver
        Permission.read(Role.user(senderId)),
        Permission.read(Role.user(receiverId)),
        Permission.update(Role.user(senderId)),
        Permission.delete(Role.user(senderId))
      ]
    );

    // 4. Update the chat's lastMessage and timestamp
    await databases.updateDocument(
      process.env.DATABASE_ID, 
      '6af324010030906d4c0b', // chats collection ID
      chatId,
      {
        lastMessage: text || "",
        updatedAt: new Date().toISOString()
      }
    );

    // 5. Return success response
    return res.json({ success: true, messageId: message.$id });

  } catch (error) {
    // Return error to the client
    return res.json({ success: false, error: error.message });
  }
};