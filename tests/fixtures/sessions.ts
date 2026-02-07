import type { SessionMeta, SessionListItem } from '../../server/sessions/session-types';

/** Mock session for project A, Claude Code */
export const MOCK_SESSION_CC_1: SessionMeta = {
  id: 'claude-code:session-001',
  projectId: 'proj-aaa-111',
  cliType: 'claude-code',
  archived: false,
  title: 'Fix authentication bug',
  lastActiveAt: '2026-01-15T14:30:00.000Z',
  createdAt: '2026-01-15T10:00:00.000Z',
};

/** Mock session for project A, Codex */
export const MOCK_SESSION_CODEX_1: SessionMeta = {
  id: 'codex:session-002',
  projectId: 'proj-aaa-111',
  cliType: 'codex',
  archived: false,
  title: 'Add unit tests',
  lastActiveAt: '2026-01-15T13:00:00.000Z',
  createdAt: '2026-01-15T11:00:00.000Z',
};

/** Mock archived session */
export const MOCK_SESSION_ARCHIVED: SessionMeta = {
  id: 'claude-code:session-003',
  projectId: 'proj-aaa-111',
  cliType: 'claude-code',
  archived: true,
  title: 'Old refactoring',
  lastActiveAt: '2026-01-14T09:00:00.000Z',
  createdAt: '2026-01-14T08:00:00.000Z',
};

/** Mock session for project B */
export const MOCK_SESSION_B: SessionMeta = {
  id: 'claude-code:session-004',
  projectId: 'proj-bbb-222',
  cliType: 'claude-code',
  archived: false,
  title: 'Setup CI pipeline',
  lastActiveAt: '2026-01-15T15:00:00.000Z',
  createdAt: '2026-01-15T12:00:00.000Z',
};

/** Session list item derived from MOCK_SESSION_CC_1 */
export const MOCK_SESSION_LIST_ITEM: SessionListItem = {
  id: 'claude-code:session-001',
  title: 'Fix authentication bug',
  lastActiveAt: '2026-01-15T14:30:00.000Z',
  cliType: 'claude-code',
};

/** All mock sessions */
export const MOCK_SESSIONS: SessionMeta[] = [
  MOCK_SESSION_CC_1,
  MOCK_SESSION_CODEX_1,
  MOCK_SESSION_ARCHIVED,
  MOCK_SESSION_B,
];
