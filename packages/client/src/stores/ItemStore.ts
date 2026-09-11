import { makeAutoObservable, runInAction } from 'mobx';
import { Item } from '@mercury-soft-2/shared';

const API_BASE_URL = 'http://localhost:3001/api';

export class ItemStore {
  items: Item[] = [];
  loading = false;
  error: string | null = null;

  constructor() {
    makeAutoObservable(this);
    this.fetchItems();
  }

  fetchItems = async () => {
    this.loading = true;
    this.error = null;
    try {
      const response = await fetch(`${API_BASE_URL}/items`);
      if (!response.ok) {
        throw new Error('Failed to fetch items');
      }
      const data = await response.json();
      runInAction(() => {
        this.items = data;
        this.loading = false;
      });
    } catch (err) {
      runInAction(() => {
        this.error = err instanceof Error ? err.message : 'Unknown error';
        this.loading = false;
      });
    }
  };

  addItem = async (name: string, description?: string) => {
    this.loading = true;
    this.error = null;
    try {
      const response = await fetch(`${API_BASE_URL}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description }),
      });
      if (!response.ok) {
        throw new Error('Failed to add item');
      }
      const newItem: Item = await response.json();
      runInAction(() => {
        this.items.unshift(newItem);
        this.loading = false;
      });
    } catch (err) {
      runInAction(() => {
        this.error = err instanceof Error ? err.message : 'Unknown error';
        this.loading = false;
      });
    }
  };

  setError = (error: string | null) => {
    this.error = error;
  };
}

let instance: ItemStore | null = null;

export const createStore = () => {
  if (!instance) {
    instance = new ItemStore();
  }
  return instance;
};
