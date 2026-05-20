import * as dotenv from 'dotenv';
dotenv.config();

export const validUser = {
  enterpriseId: process.env.TEST_ENTERPRISE_ID ?? '',
  email:        process.env.TEST_EMAIL ?? '',
  password:     process.env.TEST_PASSWORD ?? '',
};

export const invalidUser = {
  enterpriseId: process.env.TEST_ENTERPRISE_ID ?? '',
  email:        process.env.TEST_INVALID_EMAIL ?? 'wrong@example.com',
  password:     process.env.TEST_INVALID_PASSWORD ?? 'wrongpassword',
};

export const negativeUsers = {
  wrongPassword: {
    enterpriseId: process.env.TEST_ENTERPRISE_ID ?? '',
    email:        process.env.TEST_EMAIL ?? '',
    password:     'WrongPass@999',
  },
  invalidEmailFormat: {
    enterpriseId: process.env.TEST_ENTERPRISE_ID ?? '',
    email:        'not-a-valid-email',
    password:     process.env.TEST_PASSWORD ?? '',
  },
  wrongEnterpriseId: {
    enterpriseId: '0000000000',
    email:        process.env.TEST_EMAIL ?? '',
    password:     process.env.TEST_PASSWORD ?? '',
  },
  emptyEmail: {
    enterpriseId: process.env.TEST_ENTERPRISE_ID ?? '',
    email:        '',
    password:     process.env.TEST_PASSWORD ?? '',
  },
  emptyPassword: {
    enterpriseId: process.env.TEST_ENTERPRISE_ID ?? '',
    email:        process.env.TEST_EMAIL ?? '',
    password:     '',
  },
  sqlInjection: {
    enterpriseId: process.env.TEST_ENTERPRISE_ID ?? '',
    email:        "' OR '1'='1",
    password:     "' OR '1'='1",
  },
};
