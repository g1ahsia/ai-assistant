import crypto from 'crypto';

function decrypt(encryptedText, encryptionKey) {
    try {
        // Convert the base64 key back to Buffer
        const key = Buffer.from(encryptionKey, 'base64');
        
        // Split the encrypted text into its components
        const [ivBase64, authTagBase64, encryptedData] = encryptedText.split(':');
        
        const iv = Buffer.from(ivBase64, 'base64');
        const authTag = Buffer.from(authTagBase64, 'base64');
        
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);
        
        let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    } catch (error) {
        console.error('Decryption error:', error);
        throw new Error('Decryption failed');
    }
}

export default decrypt;