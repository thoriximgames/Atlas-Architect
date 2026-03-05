/**
 * SecurityService: Responsible for authentication and data encryption.
 * Registered Atlas ID: src/Core/Infrastructure/Security/SecurityService
 */
export class SecurityService {
    async authenticate(token: string): Promise<boolean> {
        return token === 'secret-atlas-key';
    }

    async encrypt(data: string): Promise<string> {
        return `encrypted(${data})`;
    }
}
