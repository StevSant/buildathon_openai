/**
 * The minimal contact info the dispatcher needs to send a WhatsApp. The proximity
 * RPC `get_alert_matches` returns only (contact_id, phone_e164) per matched contact,
 * so this is intentionally slim.
 */
export interface AlertContact {
  id: string;
  phone: string;
}
