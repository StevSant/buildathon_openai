// Public surface of the domain layer. Import from '@pulso/core' (which re-exports
// this) rather than from individual files.
export type { Category } from './category';
export type { IncidentStatus } from './incident-status';
export type { VerificationMethod } from './verification-method';
export type { Severity } from './severity';
export type { ConfirmationKind } from './confirmation-kind';
export type { EmergencyContactStatus } from './emergency-contact-status';
export type { Incident } from './incident';
export type { Profile } from './profile';
export type { NearbyIncident } from './nearby-incident';
export type { IncidentDetails } from './incident-details';
export type { IncidentComment } from './incident-comment';
export type { EmergencyContact } from './emergency-contact';
export type { AlertRule } from './alert-rule';
export type { AlertContact } from './alert-contact';
export type { AlertRecipient } from './alert-recipient';

export { CATEGORY_VALUES } from './category-values';
export { CATEGORY_LABELS } from './category-labels';
export { INCIDENT_STATUS_LABELS } from './incident-status-labels';
export { SEVERITY_LABELS } from './severity-labels';
export { validateCedula } from './validate-cedula';
export { clampSeverity } from './clamp-severity';
export { nextIncidentStatus } from './next-incident-status';
export { computeTrustScore } from './compute-trust-score';
