export interface SecretProvider {
  name: string;
  put(path: string, value: string): Promise<{ path: string }>;
  get(path: string): Promise<string>;
}

class InternalProvider implements SecretProvider {
  name = "internal";
  async put(path: string) {
    return { path };
  }
  async get(): Promise<string> {
    throw new Error("Internal provider reads from encrypted versions table");
  }
}

class GcpSecretManager implements SecretProvider {
  name = "gcp";
  async put(path: string) {
    return { path: path.startsWith("projects/") ? path : `projects/$GCP_PROJECT/secrets/${path}` };
  }
  async get(path: string): Promise<string> {
    throw new Error(`GCP Secret Manager not configured for ${path}`);
  }
}

class AwsSecretsManager implements SecretProvider {
  name = "aws";
  async put(path: string) {
    return { path };
  }
  async get(path: string): Promise<string> {
    throw new Error(`AWS Secrets Manager not configured for ${path}`);
  }
}

class AzureKeyVault implements SecretProvider {
  name = "azure";
  async put(path: string) {
    return { path };
  }
  async get(path: string): Promise<string> {
    throw new Error(`Azure Key Vault not configured for ${path}`);
  }
}

const providers: Record<string, SecretProvider> = {
  internal: new InternalProvider(),
  gcp: new GcpSecretManager(),
  aws: new AwsSecretsManager(),
  azure: new AzureKeyVault(),
};

export function getSecretProvider(name: string): SecretProvider {
  return providers[name] ?? providers.internal;
}
