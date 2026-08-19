export interface ServiceRequestInput {
  conversationId: string;
  subject: string;
  details?: Record<string, unknown>;
}

export interface QueueEntryInput {
  conversationId: string;
  queueName: string;
  payload?: Record<string, unknown>;
}

export interface AppointmentInput {
  conversationId: string;
  requestedTime?: string;
  details?: Record<string, unknown>;
}

export interface EscalationInput {
  conversationId: string;
  reason: string;
  target?: string;
}

export interface ServiceActionResult {
  id: string;
  status:
    | "created"
    | "queued"
    | "scheduled"
    | "escalated";
  providerMetadata?: Record<string, unknown>;
}

export interface ServiceActionGateway {
  createRequest(
    input: ServiceRequestInput,
  ): Promise<ServiceActionResult>;

  createQueueEntry(
    input: QueueEntryInput,
  ): Promise<ServiceActionResult>;

  bookAppointment(
    input: AppointmentInput,
  ): Promise<ServiceActionResult>;

  escalate(
    input: EscalationInput,
  ): Promise<ServiceActionResult>;
}
