# Firestore Security Specification

This document defines the security rules, invariants, valid shapes, and potential security vulnerability vectors ("The Dirty Dozen Payloads") along with their matching test cases to defend our application data.

## 1. Data Invariants

1. **Preference Configuration Isolation**: Configuration settings for a user can only be created, read, updated, or deleted by that specific authenticated user.
2. **Chat Session Ownership**: A user can only access, create, update, or delete chat sessions where the parent `{userId}` path matches their own authentic authenticated UID (`request.auth.uid`).
3. **Chat Message Integrity**: Messages can only be written if they match a valid chat session owned by the same user, and `userId` field must match `request.auth.uid`.
4. **User Verification**: Unverified logins must be audited or gated if email verification is enabled. For standard writes, users must be authenticated (`request.auth != null`).

## 2. The "Dirty Dozen" Payloads (Vulnerability Vector Simulation)

1. **Identity Spoofing in Preference config**: Attempting to write a `UserPreference` with `userId` of `victim_user_abc` while logged in as `attacker_user_xyz`.
2. **Preference Read Violation**: Attacker `user_xyz` trying to fetch `/users/user_abc/preference/config`.
3. **Chat Session Hijacking**: Attacker attempting to create a session under `/users/user_abc/chats/session_999`.
4. **Message Forgery**: Writing a message with `userId: "user_abc"` elements inside `/users/user_xyz/chats/session_1/messages/msg_1`.
5. **Session Update State Bypass**: Attempting to set an invalid `updatedAt` client-side timestamp (not equal to `request.time`).
6. **SQL/Injection characters in Session ID**: Trying to generate a massive session ID containing malicious chars.
7. **Junk Fields Injection**: Sending a payload with undocumented fields like `isVipAdmin: true` to bypass pricing gates.
8. **Malicious Role Assignment**: Specifying a `role: "god-mode-admin"` in chat message fields.
9. **No-Size String Flooding**: Injected payload containing empty or extremely long 2MB strings in text fields to exploit storage limits.
10. **Orphaned Message Batch WRITE**: Writing a message directly into a session path that does not exist in the chat logs.
11. **Negative values for Counters**: Trying to pass negative counts in numeric preference stats.
12. **Blanket Query Scraping**: Issuing a list query without specifying the `userId` filter.

All of these malicious attempts are strictly defended and rejected by our ruleset.
