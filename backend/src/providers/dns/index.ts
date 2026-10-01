export interface DnsProvider {
  name: string;
  upsert(record: { type: string; name: string; value: string; ttl: number }): Promise<{ providerRecordId: string }>;
  remove(providerRecordId: string): Promise<void>;
}

class ManualDns implements DnsProvider {
  name = "manual";
  async upsert() {
    return { providerRecordId: `manual-${Date.now()}` };
  }
  async remove() {}
}

class CloudflareDns implements DnsProvider {
  name = "cloudflare";
  async upsert() {
    return { providerRecordId: `cf-${Date.now()}` };
  }
  async remove() {}
}

class Route53Dns implements DnsProvider {
  name = "route53";
  async upsert() {
    return { providerRecordId: `r53-${Date.now()}` };
  }
  async remove() {}
}

class GoogleCloudDns implements DnsProvider {
  name = "google_cloud_dns";
  async upsert() {
    return { providerRecordId: `gcdns-${Date.now()}` };
  }
  async remove() {}
}

class NamecheapDns implements DnsProvider {
  name = "namecheap";
  async upsert() {
    return { providerRecordId: `nc-${Date.now()}` };
  }
  async remove() {}
}

class GoDaddyDns implements DnsProvider {
  name = "godaddy";
  async upsert() {
    return { providerRecordId: `gd-${Date.now()}` };
  }
  async remove() {}
}

const map: Record<string, DnsProvider> = {
  manual: new ManualDns(),
  cloudflare: new CloudflareDns(),
  route53: new Route53Dns(),
  google_cloud_dns: new GoogleCloudDns(),
  namecheap: new NamecheapDns(),
  godaddy: new GoDaddyDns(),
};

export function getDnsProvider(name: string): DnsProvider {
  return map[name] ?? map.manual;
}
