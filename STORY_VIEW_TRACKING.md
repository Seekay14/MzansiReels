# Story view tracking setup

The client uses the existing `story_views` collection ID `6af5cf2a0033a90f811c`
and the existing stories and users collections. No collection is created by this
feature.

## Deploy the trusted recorder

Deploy `record-story-view-function` as an Appwrite Function with the ID
`record-story-view`, an HTTP execution method, and authenticated-user execution
access. Configure these function environment variables:

- `APPWRITE_ENDPOINT`
- `APPWRITE_PROJECT_ID`
- `APPWRITE_API_KEY` — keep this server-side; grant only the database scopes
  needed to read users/stories/views, create story-view documents, and update
  the story view count.
- `DATABASE_ID`
- `STORIES_COLLECTION_ID`
- `USERS_COLLECTION_ID`
- `STORY_VIEWS_COLLECTION_ID`

The function validates the caller's user JWT, derives the viewer ID from
Appwrite Auth, rejects expired stories and self-views, creates a deterministic
view document, and updates the story's `views` count. The client does not get
permission to update stories or create forged view records.

## Collection permissions and indexes

- Keep document-level security enabled on `story_views`.
- Do not grant collection-wide read access or client create/update/delete access.
- The function gives each view document read permission to its viewer and the
  story owner. No other user should receive access.
- Ensure `story_views` has a composite index on `storyId` and `viewerId` for
  deduplication, and an index on `storyId` and `viewedAt` for the owner viewer
  list. A non-unique composite index is sufficient: the function uses
  deterministic document IDs to prevent new duplicate records. Existing
  historical duplicates are not deleted.
- The stories `views` attribute must exist and be numeric. Do not grant ordinary
  viewers story-document update permission; the function's server API key updates
  the count.

## Expiration cleanup

Deploy `cleanup-expired-stories-function` with its existing environment
variables, then schedule it to run periodically (for example, hourly). It uses
the server-created `$createdAt` timestamp as the authoritative 24-hour expiry
and deletes expired story media and documents. The client feed and viewer use
the same timestamp rule, so expiration does not depend on a client-supplied
`expiresAt`.

The function deployment and Appwrite Console configuration must be completed
manually; they cannot be deployed from this client repository.
