const nodemailer = require("nodemailer");


const transporter = nodemailer.createTransport({
    host: "sandbox.smtp.mailtrap.io",
    port: 25,
    secure: false, // Use true for port 465, false for port 587
    auth: {
        user: "f1ddaad50bab88",
        pass: "347540b7244bd7",
    },
});
module.exports = {
    sendMail: async function (to,url) {
        const info = await transporter.sendMail({
            from: 'hehehe@gmail.com',
            to: to,
            subject: "reset password URL",
            text: "click vao day de doi pass", // Plain-text version of the message
            html: "click vao <a href="+url+">day</a> de doi pass", // HTML version of the message
        });

        console.log("Message sent:", info.messageId);
    },
    sendUserPasswordMail: async function (to, username, password) {
        const info = await transporter.sendMail({
            from: 'hehehe@gmail.com',
            to: to,
            subject: "Thong tin tai khoan moi",
            text: `Tai khoan cua ban da duoc tao.\nUsername: ${username}\nPassword: ${password}`,
            html: `
                <p>Tai khoan cua ban da duoc tao.</p>
                <p><strong>Username:</strong> ${username}</p>
                <p><strong>Password:</strong> ${password}</p>
                <p>Vui long dang nhap va doi mat khau sau khi nhan tai khoan.</p>
            `,
        });

        console.log("Message sent:", info.messageId);
    }
}
