const { Client, Databases, Users, Query } = require('node-appwrite');

module.exports = async function (req, res) {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT)
    .setProject(process.env.APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

  const databases = new Databases(client);
  const users = new Users(client);

  try {
    const payload = JSON.parse(req.payload);
    const userId = payload.userId;

    if (!userId) return res.json({ success: false, message: "No userId provided" });

    // Delete content from collections
    const collections = [
      '6af3949e000d613946bf', // posts
      '6af0bcb10006ade69d48', // videos
      '6af0c7fd002e8d46827c', // messages
      '6af46388001b8d4a8597'  // notifications
    ];

    for (const colId of collections) {
      const docs = await databases.listDocuments('YOUR_DATABASE_ID', colId, [Query.equal('userId', userId)]);
      for (const doc of docs.documents) {
        await databases.deleteDocument('YOUR_DATABASE_ID', colId, doc.$id);
      }
    }

    // Delete profile from users collection
    const profileDocs = await databases.listDocuments('YOUR_DATABASE_ID', '6af0c69b0019c1c74d74', [Query.equal('userId', userId)]);
    for (const doc of profileDocs.documents) {
      await databases.deleteDocument('YOUR_DATABASE_ID', '6af0c69b0019c1c74d74', doc.$id);
    }

    // Delete Auth Account
    await users.delete(userId);

    return res.json({ success: true, message: "User completely deleted." });
  } catch (error) {
    return res.json({ success: false, error: error.message });
  }
};
