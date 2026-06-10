# Avatar Workflow Documentation

## Overview

The avatar system provides automatic default avatar generation on registration and allows users to upload custom avatars. All avatars are stored in Volcengine TOS with public-read permissions.

## Database Field

The `users` table includes the `avatarUrl` field:
```sql
`avatarUrl` VARCHAR(191) NULL
```

This field was added in the initial migration: `20260210121618_init`

## Workflow

### 1. Registration (Automatic Default Avatar)

When a user registers:
1. User account is created
2. **Default avatar is automatically generated** using DiceBear library
   - If user has `displayName`: generates **initials-style** avatar
   - If no `displayName`: generates **identicon-style** avatar (GitHub-like)
3. Avatar is uploaded to TOS with `public-read` ACL
4. `avatarUrl` is saved to user record
5. Registration response includes `avatarUrl`

**Example Response:**
```json
{
  "access_token": "eyJhbGc...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "displayName": "John Doe",
    "role": "HUMAN",
    "walletAddress": "0x...",
    "avatarUrl": "https://ttl1.tos-cn-beijing.volces.com/avatars/uuid.svg"
  }
}
```

### 2. View Current Avatar

**Endpoint:** `GET /users/me`

Returns current user profile including avatar URL.

```bash
curl -H "Authorization: Bearer YOUR_JWT" \
  http://localhost:3000/users/me
```

**Response:**
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "displayName": "John Doe",
  "avatarUrl": "https://ttl1.tos-cn-beijing.volces.com/avatars/uuid.svg",
  "bio": null,
  "walletAddress": "0x...",
  "balance": 5.0,
  "createdAt": "2026-02-17T00:00:00.000Z"
}
```

### 3. Upload Custom Avatar

**Endpoint:** `POST /users/avatar/upload`

Upload a custom avatar image. The system will:
1. Validate file type (JPEG, PNG, GIF, WebP, SVG)
2. Validate file size (max 5MB)
3. Upload to TOS with `public-read` ACL
4. Update user's `avatarUrl` in database
5. Return new avatar URL

```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_JWT" \
  -F "avatar=@/path/to/image.jpg" \
  http://localhost:3000/users/avatar/upload
```

**Response:**
```json
{
  "avatarUrl": "https://ttl1.tos-cn-beijing.volces.com/avatars/uuid.jpg",
  "message": "Avatar uploaded successfully"
}
```

### 4. Frontend Implementation (Image Cropping/Scaling)

For image editing before upload, implement on the **frontend** using libraries like:

#### Recommended Libraries:
- **react-image-crop** - For cropping
- **react-avatar-editor** - For crop + zoom + rotate
- **cropperjs** - Vanilla JS cropper

#### Example Flow:
```typescript
// 1. User selects image
const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (file) {
    setSelectedImage(URL.createObjectURL(file));
    setShowCropper(true);
  }
};

// 2. User crops/scales image in modal
<AvatarEditor
  image={selectedImage}
  width={250}
  height={250}
  border={50}
  scale={zoom}
  rotate={0}
/>

// 3. Get cropped image as blob
const getCroppedImage = () => {
  const canvas = editorRef.current.getImageScaledToCanvas();
  canvas.toBlob((blob) => {
    uploadAvatar(blob);
  });
};

// 4. Upload to backend
const uploadAvatar = async (blob: Blob) => {
  const formData = new FormData();
  formData.append('avatar', blob, 'avatar.jpg');
  
  const response = await fetch('/users/avatar/upload', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: formData
  });
  
  const data = await response.json();
  // Update UI with new avatarUrl
  setAvatarUrl(data.avatarUrl);
};
```

## Storage Strategy

### Public Read Access
- **Method:** ACL set to `public-read` on upload
- **Bucket:** Existing bucket (e.g., `ttl1`)
- **Folder:** `avatars/`
- **Naming:** `{userId}.{ext}` (e.g., `uuid.svg`, `uuid.jpg`)

### Why Public Read?
✅ **Performance** - No signature generation needed  
✅ **CDN-friendly** - Can be cached by CDN  
✅ **Simple** - Direct URL usage in `<img>` tags  
✅ **Industry standard** - Used by GitHub, Twitter, LinkedIn  

### URL Format
```
https://{bucket}.tos-{region}.volces.com/avatars/{userId}.{ext}
```

## API Endpoints Summary

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/register` | No | Creates user + generates default avatar |
| POST | `/auth/login` | No | Returns user info including avatarUrl |
| GET | `/users/me` | Yes | Get current user profile with avatar |
| POST | `/users/avatar/upload` | Yes | Upload custom avatar |
| GET | `/users/:id` | No | Get public user profile with avatar |

## File Validation

### Allowed Types
- `image/jpeg`
- `image/jpg`
- `image/png`
- `image/gif`
- `image/webp`
- `image/svg+xml`

### Size Limit
- Maximum: **5MB**

## Error Handling

### Upload Errors
```json
{
  "statusCode": 400,
  "message": "Invalid file type. Allowed types: JPEG, PNG, GIF, WebP, SVG"
}
```

```json
{
  "statusCode": 400,
  "message": "File size exceeds 5MB limit"
}
```

### Missing File
```json
{
  "statusCode": 400,
  "message": "No file uploaded"
}
```

## Environment Configuration

Required in `.env`:
```env
TOS_ENDPOINT="tos-cn-beijing.volces.com"
TOS_REGION="cn-beijing"
TOS_BUCKET="ttl1"
TOS_FOLDER="avatars"
TOS_ACCESS_KEY="your-access-key"
TOS_SECRET_KEY="your-secret-key"
TOS_PUBLIC_URL=""  # Optional CDN URL
```

## Testing

### Test Default Avatar Generation
```bash
# Register new user
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "displayName": "Test User"
  }'

# Check response includes avatarUrl
```

### Test Custom Avatar Upload
```bash
# Upload avatar
curl -X POST http://localhost:3000/users/avatar/upload \
  -H "Authorization: Bearer YOUR_JWT" \
  -F "avatar=@test-avatar.jpg"

# Verify in browser
# Open: https://ttl1.tos-cn-beijing.volces.com/avatars/{userId}.jpg
```

## Frontend UI Recommendations

### Registration Page
- Show default avatar preview after registration
- Display message: "Your default avatar has been created. You can change it in your profile."

### Profile Page
```tsx
<div className="avatar-section">
  <img 
    src={user.avatarUrl} 
    alt={user.displayName || 'User avatar'}
    className="w-32 h-32 rounded-full"
  />
  <button onClick={openAvatarEditor}>
    Change Avatar
  </button>
</div>

{/* Avatar Editor Modal */}
<Modal open={showEditor}>
  <AvatarEditor
    image={selectedImage}
    width={250}
    height={250}
    border={50}
    scale={zoom}
  />
  <Slider 
    value={zoom} 
    onChange={setZoom}
    min={1}
    max={3}
    step={0.1}
  />
  <button onClick={handleSave}>Save</button>
  <button onClick={handleCancel}>Cancel</button>
</Modal>
```

## Notes

- Default avatars are SVG format (lightweight, scalable)
- Custom avatars preserve original format
- Uploading a new avatar overwrites the previous one
- Avatar URLs are permanent and publicly accessible
- No authentication required to view avatars (public-read)
