import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw } from 'lucide-react';

const AWS_REGIONS = [
  'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
  'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-1', 'eu-north-1',
  'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'ap-northeast-2', 'ap-south-1',
  'sa-east-1', 'ca-central-1',
];

interface S3ConnectionFormProps {
  formData: Record<string, string>;
  onChange: (field: string, value: string) => void;
}

export function S3ConnectionForm({ formData, onChange }: S3ConnectionFormProps) {
  const authMethod = formData.authMethod || 'credentials';
  const [roles, setRoles] = useState<Array<{ arn: string; name: string }>>([]);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [rolesError, setRolesError] = useState<string | null>(null);
  const [awsProfiles, setAwsProfiles] = useState<string[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [profilesError, setProfilesError] = useState<string | null>(null);

  async function fetchRoles() {
    if (!window.api?.invoke) return;
    setLoadingRoles(true);
    setRolesError(null);
    try {
      const region = formData.region || 'us-east-1';
      // Pass source credentials if provided, otherwise use default chain
      const accessKey = formData.sourceAccessKeyId || undefined;
      const secretKey = formData.sourceSecretAccessKey || undefined;
      const result = await window.api.invoke('s3:list-roles', region, accessKey, secretKey);
      setRoles(result);
    } catch (err) {
      setRolesError(err instanceof Error ? err.message : 'Failed to fetch roles');
    } finally {
      setLoadingRoles(false);
    }
  }

  async function fetchAwsProfiles() {
    if (!window.api?.invoke) {
      setProfilesError('window.api not available');
      return;
    }
    setLoadingProfiles(true);
    setProfilesError(null);
    try {
      const result = await window.api.invoke('s3:list-profiles');
      setAwsProfiles(result);
    } catch (err: unknown) {
      setProfilesError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingProfiles(false);
    }
  }

  // Always fetch AWS profiles on mount so they're ready
  useEffect(() => {
    fetchAwsProfiles();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (authMethod === 'iam-role' && roles.length === 0) {
      fetchRoles();
    }
  }, [authMethod]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="s3-name">Connection Name</Label>
        <Input
          id="s3-name"
          placeholder="My S3 Connection"
          value={formData.name ?? ''}
          onChange={(e) => onChange('name', e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="s3-region">Region</Label>
        <Select
          value={formData.region ?? 'us-east-1'}
          onValueChange={(value) => onChange('region', value)}
        >
          <SelectTrigger id="s3-region" className="w-full">
            <SelectValue placeholder="Select region" />
          </SelectTrigger>
          <SelectContent>
            {AWS_REGIONS.map((region) => (
              <SelectItem key={region} value={region}>
                {region}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="s3-auth">Authentication Method</Label>
        <Select
          value={authMethod}
          onValueChange={(value) => onChange('authMethod', value)}
        >
          <SelectTrigger id="s3-auth" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="credentials">Access Keys</SelectItem>
            <SelectItem value="profile">AWS Profile (~/.aws)</SelectItem>
            <SelectItem value="iam-role">IAM Role (AssumeRole)</SelectItem>
            <SelectItem value="default-chain">Default Credential Chain</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground/60">
          {authMethod === 'credentials' && 'Use an IAM access key ID and secret key.'}
          {authMethod === 'profile' && 'Use a named profile from ~/.aws/credentials or ~/.aws/config.'}
          {authMethod === 'iam-role' && 'Assume an IAM role using STS. Optionally provide source credentials.'}
          {authMethod === 'default-chain' && 'Uses env vars, ~/.aws/credentials, SSO, or instance profile automatically.'}
        </p>
      </div>

      {authMethod === 'credentials' && (
        <>
          <div className="space-y-2">
            <Label htmlFor="s3-access-key">Access Key ID</Label>
            <Input
              id="s3-access-key"
              placeholder="AKIAIOSFODNN7EXAMPLE"
              value={formData.accessKeyId ?? ''}
              onChange={(e) => onChange('accessKeyId', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="s3-secret-key">Secret Access Key</Label>
            <Input
              id="s3-secret-key"
              type="password"
              placeholder="Enter secret access key"
              value={formData.secretAccessKey ?? ''}
              onChange={(e) => onChange('secretAccessKey', e.target.value)}
            />
          </div>
        </>
      )}

      {authMethod === 'profile' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="s3-profile">AWS Profile</Label>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={fetchAwsProfiles}
              disabled={loadingProfiles}
            >
              {loadingProfiles ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              <span className="ml-1">Refresh</span>
            </Button>
          </div>
          {awsProfiles.length > 0 ? (
            <Select
              value={formData.awsProfile ?? ''}
              onValueChange={(value) => onChange('awsProfile', value)}
            >
              <SelectTrigger id="s3-profile" className="w-full">
                <SelectValue placeholder="Select a profile" />
              </SelectTrigger>
              <SelectContent>
                {awsProfiles.map((profile) => (
                  <SelectItem key={profile} value={profile}>
                    <span className="font-mono text-[13px]">{profile}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              id="s3-profile"
              placeholder="default"
              value={formData.awsProfile ?? ''}
              onChange={(e) => onChange('awsProfile', e.target.value)}
            />
          )}
          <p className="text-[11px] text-muted-foreground/60">
            {profilesError
              ? <span className="text-destructive">{profilesError}</span>
              : loadingProfiles
                ? 'Loading profiles...'
                : `${awsProfiles.length} profiles found in ~/.aws`}
          </p>
        </div>
      )}

      {authMethod === 'iam-role' && (
        <>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="s3-role">IAM Role</Label>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={fetchRoles}
                disabled={loadingRoles}
              >
                {loadingRoles ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
                <span className="ml-1">Refresh</span>
              </Button>
            </div>
            {roles.length > 0 ? (
              <Select
                value={formData.roleArn ?? ''}
                onValueChange={(value) => onChange('roleArn', value)}
              >
                <SelectTrigger id="s3-role" className="w-full">
                  <SelectValue placeholder="Select an IAM role" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((role) => (
                    <SelectItem key={role.arn} value={role.arn}>
                      <div className="flex flex-col">
                        <span className="text-[13px]">{role.name}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">{role.arn}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                id="s3-role"
                placeholder="arn:aws:iam::123456789012:role/MyRole"
                value={formData.roleArn ?? ''}
                onChange={(e) => onChange('roleArn', e.target.value)}
              />
            )}
            {rolesError && (
              <p className="text-[11px] text-destructive">{rolesError}</p>
            )}
            {!rolesError && roles.length === 0 && !loadingRoles && (
              <p className="text-[11px] text-muted-foreground/60">
                Enter a role ARN manually or provide source credentials to list available roles.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="s3-external-id">External ID (optional)</Label>
            <Input
              id="s3-external-id"
              placeholder="For cross-account access"
              value={formData.externalId ?? ''}
              onChange={(e) => onChange('externalId', e.target.value)}
            />
          </div>

          <details className="group">
            <summary className="cursor-pointer text-[12px] text-muted-foreground hover:text-foreground transition-colors">
              Source Credentials (optional)
            </summary>
            <div className="mt-3 space-y-3 pl-2 border-l-2 border-border/50">
              <p className="text-[11px] text-muted-foreground/60">
                Credentials used to call AssumeRole. Leave blank to use the default credential chain.
              </p>
              <div className="space-y-2">
                <Label htmlFor="s3-source-access-key">Source Access Key ID</Label>
                <Input
                  id="s3-source-access-key"
                  placeholder="AKIAIOSFODNN7EXAMPLE"
                  value={formData.sourceAccessKeyId ?? ''}
                  onChange={(e) => onChange('sourceAccessKeyId', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="s3-source-secret-key">Source Secret Access Key</Label>
                <Input
                  id="s3-source-secret-key"
                  type="password"
                  placeholder="Enter source secret key"
                  value={formData.sourceSecretAccessKey ?? ''}
                  onChange={(e) => onChange('sourceSecretAccessKey', e.target.value)}
                />
              </div>
            </div>
          </details>
        </>
      )}

      {authMethod === 'default-chain' && (
        <div className="rounded-md border border-border/50 bg-muted/30 px-3 py-2.5">
          <p className="text-[12px] text-muted-foreground">
            The SDK will look for credentials in this order:
          </p>
          <ol className="mt-1.5 list-decimal pl-4 text-[11px] text-muted-foreground/70 space-y-0.5">
            <li>Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)</li>
            <li>Shared credentials file (~/.aws/credentials)</li>
            <li>AWS SSO / IAM Identity Center</li>
            <li>EC2 instance metadata / ECS task role</li>
          </ol>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="s3-bucket">Default Bucket</Label>
        <Input
          id="s3-bucket"
          placeholder="my-bucket (optional)"
          value={formData.defaultBucket ?? ''}
          onChange={(e) => onChange('defaultBucket', e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="s3-endpoint">Custom Endpoint</Label>
        <Input
          id="s3-endpoint"
          placeholder="For S3-compatible services (optional)"
          value={formData.endpoint ?? ''}
          onChange={(e) => onChange('endpoint', e.target.value)}
        />
      </div>
    </div>
  );
}
