/**
 * Роли пользователей системы.
 * - Operator — оператор (может запускать профили)
 * - Engineer — инженер (может создавать/редактировать профили)
 * - Admin — администратор (полный доступ, включая настройки)
 */
export enum UserRole {
  /** Оператор — базовый доступ */
  OPERATOR = 'OPERATOR',
  /** Инженер — создание и редактирование профилей */
  ENGINEER = 'ENGINEER',
  /** Администратор — полный доступ */
  ADMIN = 'ADMIN',
}

/**
 * Пользователь системы.
 * Используется для аутентификации и разграничения прав.
 */
export interface User {
  /** Уникальный идентификатор пользователя */
  id: string;
  /** Имя пользователя (логин) */
  username: string;
  /** Email */
  email: string;
  /** Роль пользователя */
  role: UserRole;
  /** Дата создания аккаунта */
  createdAt: Date;
  /** Дата последнего входа */
  lastLoginAt?: Date;
  /** Активен ли аккаунт */
  isActive: boolean;
}

/** Данные для входа */
export interface LoginCredentials {
  username: string;
  password: string;
}

/** JWT токен */
export interface JwtToken {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // секунды
}

/** Payload JWT токена */
export interface JwtPayload {
  userId: string;
  username: string;
  role: UserRole;
  exp: number; // expiration timestamp
}
