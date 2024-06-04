const nodemailer = require('nodemailer');

module.exports = class Email {
  constructor(user, url) {
    this.to = user.email;
    this.firstName = user.name.split(' ')[0];
    this.url = url;
    this.from = `Ahmed <${process.env.EMAIL_FROM}>`;
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
    return nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      auth: {
        user: process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_PASSWORD,
      },
    });
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
    const subject = 'Welcome to the TourMe Family!';
    const htmlContent = `<p>Hello, <strong>${this.firstName}</strong>!</p><p>Welcome to the TourMe Family! Click <a href="${this.url}">here</a> to access your account.</p>`;
    const textContent = `Hello, ${this.firstName}!\n\nWelcome to the TourMe Family! Click ${this.url} to access your account.`;

    // Send the welcome email
    await this.send(subject, htmlContent, textContent);
  }

  async sendPasswordReset() {
    // Define the content for the password reset email
    const subject = 'Your password reset token (valid for only 10 minutes)';
    const htmlContent = `<p>Hello, <strong>${this.firstName}</strong>!</p><p>Your password reset token is: ${this.url}</p><p>This token is valid for only 10 minutes.</p>`;
    const textContent = `Hello, ${this.firstName}!\n\nYour password reset token is: ${this.url}\n\nThis token is valid for only 10 minutes.`;

    // Send the password reset email
    await this.send(subject, htmlContent, textContent);
  }
};
