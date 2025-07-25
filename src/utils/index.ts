import bcrypt from "bcryptjs";
import jwt, { JwtPayload } from "jsonwebtoken";
import { JWT_EXPIRES_IN, JWT_REFRESH_EXPIRES_IN, JWT_REFRESH_SECRET, JWT_SECRET } from "../config";
import { UserPayload } from "../interface/User.dto";

export const GenerateOTP = () => {
  const otp = Math.floor(1000 + Math.random() * 9000);
  const expiry = new Date();
  expiry.setTime(new Date().getTime() + 30 * 60 * 1000);
  return { otp, expiry };
}

export const GenerateSalt = async () => {
  return await bcrypt.genSalt();
};

export const HashPassword = async (password: string, salt: string) => {
  return await bcrypt.hash(password, salt);
};
export const GenerateSignature = async (payload: UserPayload) => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "1d"});
};

export const GenerateRefreshToken = async (payload: UserPayload) => {
  return jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: "7d" });
};

export const verifySignature = async (signature: string) => {
  return jwt.verify(signature, JWT_SECRET) as JwtPayload;
};

export const verifyRefreshToken = async (signature: string) => {
  return jwt.verify(signature, JWT_REFRESH_SECRET) as JwtPayload;
};

export const validatePassword = async (
  enteredPassword: string,
  savedPassword: string,
  salt: string
) => {
  return (await HashPassword(enteredPassword, salt)) === savedPassword;
};


