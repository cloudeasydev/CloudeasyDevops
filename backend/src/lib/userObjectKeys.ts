export function interviewAnswersKey(userId: string) {
  return `users/${userId}/interview/answers.json`;
}

export function apiStudioStateKey(userId: string) {
  return `users/${userId}/api-studio/state.json`;
}

export function brandingLogoKey(filename: string) {
  return `branding/${filename}`;
}

export function driveFileKey(userId: string, nodeId: string, safeName: string) {
  return `users/${userId}/drive/${nodeId}/${safeName}`;
}
