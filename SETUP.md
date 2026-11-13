# MzansiReels upgrade: setup

## 1. Install (Expo SDK 58)
```bash
npx expo uninstall expo-av        # removed from the SDK; replaced by expo-video
npx expo install expo-video
npx expo install --fix            # aligns every package with SDK 58
npx expo-doctor
npx expo lint
```
`expo-av` has been removed in favor of `expo-video`. Video uploads generate a thumbnail
before saving it to Appwrite Storage: native uses `expo-video-thumbnails`, and web
captures a frame from the selected local video. The thumbnail file is uploaded with
public-read permission, and its Appwrite preview URL is saved in the video document.
If generation fails, the video is still posted and the profile grid shows its video
placeholder instead of trying to preview the video file as an image.
Because `expo-video` and the image picker plugin changed, build a development build
(`npx expo run:android` / `run:ios`) if Expo Go complains.

## 2. Appwrite: two new collections
Create both in database `6af0bc84001abbbcb856`, then paste their IDs into `config/constants.js`.

| Collection | Attributes (all required strings) |
|---|---|
| likes   | `videoId` (36), `userId` (36) |
| follows | `followerId` (36), `followingId` (36) |

Add an index on each collection for the fields you query (likes: `videoId`, `userId`; follows: `followerId`, `followingId`).

Permissions: grant each collection only the operations the app needs. Enable document
security for messages, chats, and typing status. Do not grant collection-level access to
messages or chats; their writes go through the authenticated `send-message` Appwrite
Function so the server can safely assign participant permissions. Message documents allow
both participants to read, and only the sender to edit or delete. The recipient marks
messages read through the function. Chat documents allow participant reads/deletes; the
function updates the preview.

Deploy `send-message-function` as an Appwrite Function with ID **`send-message`**, enable
execution by authenticated users, set `index.js` as its entrypoint, and install the
dependencies from its `package.json`.
Configure these function variables:

| Variable | Value |
|---|---|
| `APPWRITE_ENDPOINT` | `https://cloud.appwrite.io/v1` (or your Appwrite endpoint) |
| `APPWRITE_PROJECT_ID` | `6af0b93b00320e635f66` |
| `APPWRITE_API_KEY` | Server-only API key with database read/write and file read/write scopes |
| `DATABASE_ID` | `6af0bc84001abbbcb856` |
| `USERS_COLLECTION_ID` | `6af0c69b0019c1c74d74` |
| `MESSAGES_COLLECTION_ID` | `6af0c7fd002e8d46827c` |
| `CHATS_COLLECTION_ID` | `6af324010030906d4c0b` |
| `BLOCKS_COLLECTION_ID` | `6af31db90012d83cf0bb` |
| `TYPING_COLLECTION_ID` | `6af31c57001d52c8fbd0` |
| `STORAGE_BUCKET_ID` | `6af0bf150026128b0048` |

Keep the API key only in Function secrets/environment; never put it in the Expo app.
Enable file security on the existing storage bucket and remove broad bucket-level read
access. Public feed/profile uploads can retain per-file public read permissions, while
message attachments are shared only with the chat participants by the Function.

Add indexes to the existing collections used by messaging queries: `users.userId`,
`users.name`, `users.username`; `messages.chatId` and a composite `messages.receiverId` +
`messages.isRead`; `chats.participants` (array index) and `chats.updatedAt`; and a
composite `blocks.blockerId` + `blocks.blockedId`. Keep the existing collection IDs; do
not create replacement collections. Check any other collection permissions separately
before deployment.

The likes and follows collections need no attributes beyond those listed above.

Add an optional String attribute named `thumbnailUrl` to the existing videos collection.
It stores the Appwrite preview URL of the uploaded thumbnail image. Keep file security
enabled on the storage bucket; uploaded videos and their thumbnails receive public read
permission per file so both owners and visitors can view profiles.

The registration onboarding flow uses the `users` collection's existing `username`
and `avatarUrl` string attributes and its `interests` string-array attribute, plus:

| Attribute | Type | Notes |
|---|---|---|
| `province` | String (optional) | Selected South African province |
| `profileSetupComplete` | Boolean | Default false until profile setup is saved |
| `termsAccepted` | Boolean (optional) | Set true when the user accepts the terms |

Add a **unique index** on `username` to enforce handle uniqueness across simultaneous
sign-ups. The app also checks availability while the user types.

## 3. Appwrite platform
`config/appwrite.js` still uses `setPlatform('127.0.0.1')`. In the Appwrite console, add a
platform whose ID matches what you set. For devices that is your bundle id / package name
(`com.yourname.mzansireels`, change it in app.json too) and `host.exp.exponent` for Expo Go.

## Project layout
Drop these files into your project (they replace the old ones). `App.js`, `index.js`,
`app.json`, `config/`, `context/`, `components/`, `screens/`.
Navigation stays on React Navigation. Your AGENTS.md prefers Expo Router; say so if you want that migration.
