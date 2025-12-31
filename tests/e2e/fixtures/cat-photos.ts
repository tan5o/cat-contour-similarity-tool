import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const realCatPhotos = [
  '07d39f75-d99d-45e8-9f26-339c8f7ddc39-md.jpeg',
  '9164aeff-138b-4ca3-8d68-c1f01c5a3ff7-md.jpeg',
  'b1d377ab-08fc-45cb-a426-2c3a5e9cad7a-md.jpeg',
  'd07f7d80-61ac-4343-b3fb-e02a363f53c8-md.jpeg',
  'fc2976e7-ac3b-4219-b75c-641aec1ee2cd-md.jpeg'
].map(filename => ({
  name: filename,
  path: path.resolve(__dirname, 'cats', filename)
}));
