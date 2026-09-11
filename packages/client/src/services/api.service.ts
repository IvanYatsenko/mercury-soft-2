import { ThermalProfile, Furnace, Sensor, Heater, User } from '@mercury-soft-2/shared';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

class ApiService {
  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      ...options,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || 'Request failed');
    }

    return response.json();
  }

  // ==================== Thermal Profiles ====================

  async getProfiles(): Promise<ThermalProfile[]> {
    return this.request<ThermalProfile[]>('/thermal-profiles');
  }

  async getProfile(id: string): Promise<ThermalProfile> {
    return this.request<ThermalProfile>(`/thermal-profiles/${id}`);
  }

  async createProfile(
    profile: Omit<ThermalProfile, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<ThermalProfile> {
    return this.request<ThermalProfile>('/thermal-profiles', {
      method: 'POST',
      body: JSON.stringify(profile),
    });
  }

  async updateProfile(
    id: string,
    profile: Partial<Omit<ThermalProfile, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<ThermalProfile> {
    return this.request<ThermalProfile>(`/thermal-profiles/${id}`, {
      method: 'PUT',
      body: JSON.stringify(profile),
    });
  }

  async deleteProfile(id: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/thermal-profiles/${id}`, {
      method: 'DELETE',
    });
  }

  // ==================== Furnace ====================

  async getFurnace(): Promise<Furnace> {
    return this.request<Furnace>('/furnace');
  }

  // ==================== Sensors ====================

  async getSensors(): Promise<Sensor[]> {
    return this.request<Sensor[]>('/sensors');
  }

  // ==================== Heaters ====================

  async getHeaters(): Promise<Heater[]> {
    return this.request<Heater[]>('/heaters');
  }

  // ==================== Users ====================

  async getCurrentUser(): Promise<User> {
    return this.request<User>('/users/me');
  }

  // ==================== Health ====================

  async getHealth(): Promise<{
    status: string;
    timestamp: string;
    version: string;
    database: string;
  }> {
    return this.request('/health');
  }
}

export const apiService = new ApiService();
