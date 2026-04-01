/**
 * Backend-ready API layer. When VITE_API_URL is set, replace in-memory
 * implementations with fetch() calls to the base URL.
 */
export { getApiBaseUrl, isBackendEnabled } from './config';
export {
  getSession,
  login,
  logout,
  type LoginCredentials,
  type RegistryUser as AuthRegistryUser,
} from './auth.service';
export {
  initRegistry,
  getRegistry,
  updateRegistry,
  getAdminUsers,
  updateAdminUsers,
  type RegistryUser,
} from './registry.service';
export {
  initTransmissions,
  getPending,
  getHistory,
  getValidatedStats,
  submitTransmission,
  validateTransmission,
} from './transmissions.service';
export { listAnnouncements, createAnnouncement, deleteAnnouncement } from './announcements.service';
export { listAudit, appendAudit } from './audit.service';
export { listNotifications, addNotification, deleteNotification } from './notifications.service';
