import {
  Injectable,
  NotAcceptableException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto, UpdateUserPasswordDto } from './dto/update-user.dto';
import { handleErrorConstraintUnique } from 'src/utils/handle-error-unique.util';
import { User } from './entities/user.entity';
import jwtDecode from 'jwt-decode';
import * as nodemailer from 'nodemailer';
import {
  htmlExampleChanged,
  htmlExampleChangePassword,
  htmlExampleVerify,
} from 'src/utils/html-examples';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUserDto): Promise<User> {
    const hashedPassword = await bcrypt.hash(dto.password, 8);

    const data = {
      name: dto.name,
      email: dto.email,
      password: hashedPassword,
    };

    return await this.prisma.user
      .create({ data })
      .then((user) => {
        const transporter = nodemailer.createTransport({
          host: 'smtp.gmail.com',
          port: 587,
          service: 'gmail',
          auth: {
            user: 'ewithoutmail@gmail.com',
            pass: 'wcgflkdvrvcbwjyo',
          },
        });

        const mailData = {
          from: 'E Without Mail<ewithoutmail@gmail.com>',
          to: dto.email,
          subject: 'Verify your email',
          html: htmlExampleVerify(dto.name, user.id),
        };

        transporter.sendMail(mailData, function (err, info) {
          if (err) {
            console.log(err);
          } else {
            console.log(info);
          }
        });

        return user;
      })
      .catch(handleErrorConstraintUnique);
  }

  async verifyUserEmail(id: string) {
    const user: User = await this.prisma.user.findUnique({
      where: { id },
    });

    if (user.isVerified) {
      throw new NotAcceptableException('Email already verified');
    }

    return this.prisma.user
      .update({
        where: { id },
        data: {
          isVerified: true,
        },
      })
      .then(() => {
        return 'Email verified! You can close this page and login';
      })
      .catch(handleErrorConstraintUnique);
  }

  async forgotPasswordEmail(email: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new NotFoundException(`Email '${email}' not found`);
    }

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      service: 'gmail',
      auth: {
        user: 'ewithoutmail@gmail.com',
        pass: 'wcgflkdvrvcbwjyo',
      },
    });

    const mailData = {
      from: 'E Without Mail<ewithoutmail@gmail.com>',
      to: email,
      subject: 'Reset your password',
      html: htmlExampleChangePassword(user.name, user.id),
    };

    transporter.sendMail(mailData, function (err, info) {
      if (err) {
        console.log(err);
      } else {
        console.log(info);
      }
    });

    return 'Email sent!';
  }

  async changePassword(
    id: string,
    dto: UpdateUserPasswordDto,
  ): Promise<{ message: string }> {
    const hashedPassword = await bcrypt.hash(dto.password, 8);

    dto.updatedAt = new Date();

    return this.prisma.user
      .update({
        where: { id },
        data: {
          password: hashedPassword,
          updatedAt: dto.updatedAt,
        },
      })
      .then((user) => {
        const transporter = nodemailer.createTransport({
          host: 'smtp.gmail.com',
          port: 587,
          service: 'gmail',
          auth: {
            user: 'ewithoutmail@gmail.com',
            pass: 'wcgflkdvrvcbwjyo',
          },
        });

        const mailData = {
          from: 'E Without Mail<ewithoutmail@gmail.com>',
          to: user.email,
          subject: 'Password changed',
          html: htmlExampleChanged(user.name, 'password'),
        };

        transporter.sendMail(mailData, function (err, info) {
          if (err) {
            console.log(err);
          } else {
            console.log(info);
          }
        });
        return { message: 'Password changed' };
      })
      .catch(handleErrorConstraintUnique);
  }

  findOne(id: string, headers: { authorization: string }): Promise<User> {
    return this.verifyIdAndReturnUser(id, headers);
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    headers: { authorization: string },
  ): Promise<User> {
    await this.verifyIdAndReturnUser(id, headers);

    if (dto.password) {
      dto.password = await bcrypt.hash(dto.password, 8);
    }

    dto.updatedAt = new Date();

    if (dto.email) {
      throw new NotAcceptableException('Email cannot be updated');
    }

    return this.prisma.user
      .update({
        where: { id },
        data: {
          ...dto,
        },
      })
      .catch(handleErrorConstraintUnique);
  }

  async remove(id: string, headers: { authorization: string }) {
    await this.verifyIdAndReturnUser(id, headers);
    return await this.prisma.user.delete({ where: { id } });
  }

  async verifyIdAndReturnUser(
    id: string,
    headers: { authorization: string },
  ): Promise<User> {
    const user: User = await this.prisma.user
      .findUnique({
        where: { id },
      })
      .catch((err) => {
        if (err.code === 'P2023') {
          throw new NotAcceptableException(`'${id}' is not a valid ID`);
        }
        throw new NotFoundException(`User id '${id}' not found`);
      });

    if (!user) {
      throw new NotFoundException(`User id '${id}' not found`);
    }
    const payload: User = jwtDecode(headers.authorization);

    if (payload.email !== user.email) {
      throw new UnauthorizedException(`Emails don't match`);
    }

    return user;
  }
}
