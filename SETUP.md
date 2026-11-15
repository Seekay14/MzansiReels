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

Do not disable document security or grant `All Users` collection access on chats/messages:
that makes every authenticated account able to read or alter other users' conversations.

Deploy `send-message-function` as an Appwrite Function with ID **`send-message`**, enable
execution by authenticated users, use `send-message-function/index.js` as its entrypoint,
and install the
dependencies from its `package.json`.
Configure these function variables:

| Variable | Value |
|---|---|
| `APPWRITE_ENDPOINT` | `https://fra.cloud.appwrite.io/v1` (use the region shown in `appwrite.config.json`) |
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

Store the two chat participant IDs as a JSON-encoded string in the existing
`chats.participants` string attribute. The client and Function also read legacy JSON
strings, comma-separated strings, and array values so existing conversations remain
accessible. Add indexes to the existing collections used by messaging queries:
`users.userId`, `users.name`, `users.username`; `messages.chatId` and a composite
`messages.receiverId` + `messages.isRead`; `chats.participants` (string index) and
`chats.updatedAt`; and a composite `blocks.blockerId` + `blocks.blockedId`. Keep the
existing collection IDs; do not create replacement collections. Check any other
collection permissions separately before deployment.

The likes and follows collections need no attributes beyond those listed above.

## Web production and Neocities deployment

The web build is a static React Navigation single-page app; it does not need a
Node.js server after export. `npm run build:web` writes the production site to
`dist/`. The Neocities `404.html` fallback preserves a requested route, returns
to the site root, then restores that route for React Navigation. Direct-route
refresh depends on Neocities serving its configured 404 page for missing paths.

The default Expo base URL is `/` for Neocities. The GitHub Pages workflow sets
`EXPO_BASE_URL=/MzansiReels` so its repository path continues to work.

The deploy command is `npm run deploy`; it builds first and then runs
`neocities push dist`. The official Neocities CLI requires Ruby and RubyGems:
install Ruby for Windows, reopen the VS Code terminal, then install the CLI with
`gem install neocities`. Authenticate using the CLI's supported local credential
mechanism after checking `neocities --help`; do not store the API key in this
project or in frontend files. Confirm the Neocities site destination before
running `npm run deploy`. Verify any dry-run option with `neocities push --help`
because the CLI is not installed in the current environment.

Appwrite browser requests go directly from the Neocities origin to the existing
regional Appwrite endpoint. Register the deployed site origin as a Web platform
in the Appwrite project and test CORS, session-cookie behavior, and response CSP
from the live site before relying on authentication. No Appwrite API key belongs
in this static frontend.

## Authentication and feed visibility

The app requires a real Appwrite Email/Password session to enter its screens.
There is no local-name or guest-login flow. The `posts` collection remains
publicly readable through Appwrite, including posts from accounts marked
private, while create, update, and delete remain limited to authenticated users.
The `postLikes` and `postComments` collections are users-only, and the
`bookmarks` collection is users-only. Other collections, including messages,
are not made public.

The collection permissions are stored in Appwrite, not this repository's
`appwrite.config.json`. To reproduce the setting in Appwrite Console, open the
`posts` collection's permissions and preserve its authenticated permissions while
adding `read("any")`:

```text
create("users")
read("any")
update("users")
delete("users")
```

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
The Expo client reads `EXPO_PUBLIC_APPWRITE_ENDPOINT`, `EXPO_PUBLIC_APPWRITE_PROJECT_ID`,
and `EXPO_PUBLIC_APPWRITE_PLATFORM` when set. Defaults use the regional endpoint and
project ID in `appwrite.config.json`. In the Appwrite console, add a platform whose ID
matches `EXPO_PUBLIC_APPWRITE_PLATFORM`; for Android this is the package name in
`app.json` (`com.yourname.mzansireels` by default), and Expo Go also requires the
`host.exp.exponent` platform.

## Project layout
Drop these files into your project (they replace the old ones). `App.js`, `index.js`,
`app.json`, `config/`, `context/`, `components/`, `screens/`.
Navigation stays on React Navigation. Your AGENTS.md prefers Expo Router; say so if you want that migration.
