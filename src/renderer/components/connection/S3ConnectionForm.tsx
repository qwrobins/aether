import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const AWS_REGIONS = [
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
  'eu-west-1',
  'eu-west-2',
  'eu-west-3',
  'eu-central-1',
  'eu-north-1',
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-northeast-1',
  'ap-northeast-2',
  'ap-south-1',
  'sa-east-1',
  'ca-central-1',
];

interface S3ConnectionFormProps {
  formData: Record<string, string>;
  onChange: (field: string, value: string) => void;
}

export function S3ConnectionForm({ formData, onChange }: S3ConnectionFormProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="s3-name">Connection Name</Label>
        <Input
          id="s3-name"
          placeholder="My S3 Bucket"
          value={formData.name ?? ''}
          onChange={(e) => onChange('name', e.target.value)}
          required
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
        <Label htmlFor="s3-access-key">Access Key ID</Label>
        <Input
          id="s3-access-key"
          placeholder="AKIAIOSFODNN7EXAMPLE"
          value={formData.accessKeyId ?? ''}
          onChange={(e) => onChange('accessKeyId', e.target.value)}
          required
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
          required
        />
      </div>

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
          placeholder="For S3-compatible services"
          value={formData.endpoint ?? ''}
          onChange={(e) => onChange('endpoint', e.target.value)}
        />
      </div>
    </div>
  );
}
