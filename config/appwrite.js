import 'react-native-url-polyfill/auto';
import {
  Client,
  Account,
  ID,
  Databases,
  Storage,
  Functions,
  Permission,
  Role,
  Query,
} from 'react-native-appwrite';

// Hardcoded to ensure the correct project is always used
export const APPWRITE_ENDPOINT = 'https://cloud.appwrite.io/v1';
export const APPWRITE_PROJECT_ID = '6af0b93b00320e635f66';
export const APPWRITE_PLATFORM = 'com.yourname.mzansireels';

// Initialize the client ONCE
const client = new Client()
  .setEndpoint(APPWRITE_ENDPOINT)
  .setProject(APPWRITE_PROJECT_ID)
  .setPlatform(APPWRITE_PLATFORM);

// Initialize all services
export const account = new Account(client);
export const databases = new Databases(client);
export const storage = new Storage(client);
export const functions = new Functions(client);

// Export client and helpers (client is exported ONCE here)
export { client, ID, Permission, Role, Query };