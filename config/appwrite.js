import 'react-native-url-polyfill/auto';
import { Client, Account, ID, Databases, Storage, Query } from 'react-native-appwrite';

const client = new Client()
  .setEndpoint('https://cloud.appwrite.io/v1')
  .setProject('6af0b93b00320e635f66') 
  .setPlatform('127.0.0.1'); // 👈 FIXED: Matches the Hostname in your Appwrite screenshot

export const account = new Account(client);
export const databases = new Databases(client);
export const storage = new Storage(client);
export { client, ID, Query };