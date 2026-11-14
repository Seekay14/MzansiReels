import 'react-native-url-polyfill/auto';
import linkedAppwriteConfig from '../appwrite.config.json';
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

export const APPWRITE_ENDPOINT = (
  process.env.EXPO_PUBLIC_APPWRITE_ENDPOINT || linkedAppwriteConfig.endpoint
).trim().replace(/\/+$/, '');
export const APPWRITE_PROJECT_ID = (
  process.env.EXPO_PUBLIC_APPWRITE_PROJECT_ID || linkedAppwriteConfig.projectId
).trim();
export const APPWRITE_PLATFORM = (
  process.env.EXPO_PUBLIC_APPWRITE_PLATFORM || 'com.yourname.mzansireels'
).trim();

const client = new Client()
  .setEndpoint(APPWRITE_ENDPOINT)
  .setProject(APPWRITE_PROJECT_ID)
  .setPlatform(APPWRITE_PLATFORM);

export const account = new Account(client);
export const databases = new Databases(client);
export const storage = new Storage(client);
export const functions = new Functions(client);
export { client, ID, Permission, Role, Query };