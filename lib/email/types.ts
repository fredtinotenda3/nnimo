export type EmailMessage = {
  to: string;
  subject: string;
  /** Plain text is the source of truth; HTML is a nicety. */
  text: string;
  html?: string;
  replyTo?: string;
};

export interface EmailTransport {
  readonly id: string;
  isConfigured(): boolean;
  send(message: EmailMessage): Promise<{ id: string | null }>;
}

export type OrderEmailKind =
  | "order.received"
  | "payment.successful"
  | "payment.failed"
  | "order.confirmed"
  | "order.ready"
  | "order.dispatched"
  | "order.delivered";
