import { errorResponse, jsonResponse, verifyAdmin } from '../_lib.js';

export async function onRequestGet({ request, env }) {
  try {
    return jsonResponse({ admin: await verifyAdmin(request, env) });
  } catch (error) {
    return errorResponse(error);
  }
}
