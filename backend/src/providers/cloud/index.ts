export interface CloudProviderAdapter {
  name: string;
  listProjects(): Promise<{ id: string; name: string }[]>;
}

class Stub implements CloudProviderAdapter {
  constructor(public name: string) {}
  async listProjects() {
    return [];
  }
}

const adapters: Record<string, CloudProviderAdapter> = {
  gcp: new Stub("gcp"),
  aws: new Stub("aws"),
  azure: new Stub("azure"),
  digitalocean: new Stub("digitalocean"),
  hostinger: new Stub("hostinger"),
  other: new Stub("other"),
};

export function getCloudProvider(name: string) {
  return adapters[name] ?? adapters.other;
}
