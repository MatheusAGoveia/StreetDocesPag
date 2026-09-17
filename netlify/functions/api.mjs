import { handleApi } from "../../server/api.mjs";
import { blobStorage } from "../../server/storage.mjs";

export default async function handler(request) {
  return handleApi(request, await blobStorage());
}
