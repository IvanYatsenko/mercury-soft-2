import { ThermalProfile, Furnace, Sensor, Heater } from '@mercury-soft-2/shared';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

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
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  // Health check
  async healthCheck() {
    return this.request<{ status: string }>('/api/health');
  }

  // Thermal profiles CRUD
  async getThermalProfiles(): Promise<ThermalProfile[]> {
    return this.request<ThermalProfile[]>('/api/thermal-profiles');
  }

  async getThermalProfile(id: string): Promise<ThermalProfile> {
    return this.request<ThermalProfile>(`/api/thermal-profiles/${id}`);
  }

  async createThermalProfile(profile: Omit<ThermalProfile, 'id'>): Promise<ThermalProfile> {
    return this.request<ThermalProfile>('/api/thermal-profiles', {
      method: 'POST',
      body: JSON.stringify(profile),
    });
  }

  async updateThermalProfile(
    id: string,
    profile: Partial<ThermalProfile>,
  ): Promise<ThermalProfile> {
    return this.request<ThermalProfile>(`/api/thermal-profiles/${id}`, {
      method: 'PUT',
      body: JSON.stringify(profile),
    });
  }

  async deleteThermalProfile(id: string): Promise<void> {
    return this.request(`/api/thermal-profiles/${id}`, {
      method: 'DELETE',
    });
  }

  // Furnace
  async getFurnace(): Promise<Furnace> {
    return this.request<Furnace>('/api/furnace');
  }

  async updateFurnace(furnace: Partial<Furnace>): Promise<Furnace> {
    return this.request<Furnace>('/api/furnace', {
      method: 'PUT',
      body: JSON.stringify(furnace),
    });
  }

  // Sensors
  async getSensors(): Promise<Sensor[]> {
    return this.request<Sensor[]>('/api/sensors');
  }

  // Heaters
  async getHeaters(): Promise<Heater[]> {
    return this.request<Heater[]>('/api/heaters');
  }

  // User
  async getCurrentUser() {
    return this.request<{ id: number; username: string; role: string }>('/api/users/me');
  }
}

export const apiService = new ApiService();
export default apiService;
