/** Mock mínimo de una cola BullMQ para tests — solo necesitamos `.add()`. */
export function createMockQueue() {
  return { add: jest.fn().mockResolvedValue({ id: "job_1" }) };
}
