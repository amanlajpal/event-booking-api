import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { userRepository } from '../repositories/user.repository.js';
import { env } from '../config/env.js';
import { AppError } from '../middlewares/error.middleware.js';
import { AuthenticatedUser } from '../middlewares/auth.middleware.js';

export class AuthService {
  async register(data: {
    name: string;
    email: string;
    password: string;
    role: 'ORGANIZER' | 'CUSTOMER';
  }): Promise<{ user: Omit<AuthenticatedUser, 'userId'> & { id: string; name: string }; token: string }> {
    const existing = await userRepository.findByEmail(data.email);
    if (existing) {
      throw new AppError('Email is already registered', 409);
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(data.password, salt);

    const user = await userRepository.create({
      name: data.name,
      email: data.email,
      password: hashedPassword,
      role: data.role,
    });

    const token = this.generateToken({
      userId: user.id,
      email: user.email,
      role: user.role as 'ORGANIZER' | 'CUSTOMER',
    });

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role as 'ORGANIZER' | 'CUSTOMER',
      },
      token,
    };
  }

  async login(data: {
    email: string;
    password: string;
  }): Promise<{ user: { id: string; name: string; email: string; role: string }; token: string }> {
    const user = await userRepository.findByEmail(data.email);
    if (!user) {
      throw new AppError('Invalid email or password', 401);
    }

    const isMatch = await bcrypt.compare(data.password, user.password);
    if (!isMatch) {
      throw new AppError('Invalid email or password', 401);
    }

    const token = this.generateToken({
      userId: user.id,
      email: user.email,
      role: user.role as 'ORGANIZER' | 'CUSTOMER',
    });

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      token,
    };
  }

  async getCurrentUser(userId: string) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...safeUser } = user;
    return safeUser;
  }

  private generateToken(payload: AuthenticatedUser): string {
    return jwt.sign(payload, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN as unknown as number,
    });
  }
}

export const authService = new AuthService();
