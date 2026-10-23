let lastId = 0;

export function nextMessageId(): number {
  lastId = Math.max(lastId + 1, Date.now() * 1000);
  return lastId;
}
