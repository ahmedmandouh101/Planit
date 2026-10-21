const nodemailer = require('nodemailer');

module.exports = class Email {
  constructor(user, url) {
    this.to = user.email;
    this.firstName = user.name.split(' ')[0];
    this.url = url;
    this.from = `Planit <${process.env.EMAIL_FROM}>`;
  }

  newTransport() {
    if (process.env.NODE_ENV === 'production') {
      // Sendgrid
      return nodemailer.createTransport({
        service: 'SendGrid',
        auth: {
          user: process.env.SENDGRID_USERNAME,
          pass: process.env.SENDGRID_PASSWORD,
        },
      });
    }
    // Nodemailer
    const options = {
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT || 1025),
      secure: process.env.EMAIL_SECURE === 'true',
      connectionTimeout: 10000,
      socketTimeout: 10000,
    };
    if (process.env.EMAIL_USERNAME && process.env.EMAIL_PASSWORD) {
      options.auth = {
        user: process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_PASSWORD,
      };
    }
    return nodemailer.createTransport(options);
  }

  async send(subject, htmlContent, textContent) {
    const mailOptions = {
      from: this.from,
      to: this.to,
      subject,
      html: htmlContent,
      text: textContent,
    };
    // 3) Actually send the email (create a transport)
    await this.newTransport().sendMail(mailOptions);
  }

  async sendWelcome() {
    // Define the content for the welcome email
    const subject = 'Welcome to Planit!';
    const htmlContent = `<p>Welcome to Planit!</p><p>Your account is ready. Sign in to start planning your next trip.</p>`;
    const textContent = 'Welcome to Planit! Your account is ready. Sign in to start planning your next trip.';

    // Send the welcome email
    await this.send(subject, htmlContent, textContent);
  }

  async sendPasswordReset() {
    // Define the content for the password reset email
    const subject = 'Your password reset token (valid for only 10 minutes)';
    const htmlContent = `<p>Hello from Planit!</p><p>Your password reset URL is: ${this.url}</p><p>This token is valid for only 10 minutes.</p>`;
    const textContent = `Hello, ${this.firstName}!\n\nYour password reset token is: ${this.url}\n\nThis token is valid for only 10 minutes.`;

    // Send the password reset email
    await this.send(subject, htmlContent, textContent);
  }
};
