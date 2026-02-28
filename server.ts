import express from "express";
import { createServer as createViteServer } from "vite";
import nodemailer from "nodemailer";
import multer from "multer";

const upload = multer({ storage: multer.memoryStorage() });

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API routes
  app.post("/api/test-connection", async (req, res) => {
    try {
      const {
        smtpHost,
        smtpPort,
        connectionMode,
        username,
        password,
      } = req.body;

      if (!smtpHost || !smtpPort) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const port = parseInt(smtpPort, 10);

      const transportOptions: any = {
        host: smtpHost,
        port: port,
        secure: port === 465, 
        logger: true,
        debug: true,
      };

      if (connectionMode === "auth") {
        transportOptions.auth = {
          user: username,
          pass: password,
        };
      } else if (connectionMode === "starttls") {
        transportOptions.requireTLS = true;
        if (username && password) {
          transportOptions.auth = {
            user: username,
            pass: password,
          };
        }
      }

      const transporter = nodemailer.createTransport(transportOptions);
      await transporter.verify();

      res.json({
        success: true,
        message: "Connection successful",
      });
    } catch (error: any) {
      console.error("Error testing connection:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to connect",
        details: error,
      });
    }
  });

  app.post("/api/send-email", upload.array("attachments"), async (req, res) => {
    try {
      const {
        smtpHost,
        smtpPort,
        connectionMode,
        username,
        password,
        from,
        to,
        cc,
        bcc,
        subject,
        body,
        isHtml,
      } = req.body;

      if (!smtpHost || !smtpPort || !from || !to) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const port = parseInt(smtpPort, 10);

      // Configure transport options based on connection mode
      const transportOptions: any = {
        host: smtpHost,
        port: port,
        // STARTTLS is typically used with port 587, and secure: false means upgrade later with STARTTLS
        // secure: true is for port 465 (TLS from start)
        secure: port === 465, 
        logger: true, // Log to console
        debug: true, // Include SMTP traffic in the logs
      };

      if (connectionMode === "auth") {
        transportOptions.auth = {
          user: username,
          pass: password,
        };
      } else if (connectionMode === "starttls") {
        transportOptions.requireTLS = true;
        if (username && password) {
          transportOptions.auth = {
            user: username,
            pass: password,
          };
        }
      } else if (connectionMode === "anonymous") {
        // No auth object
      }

      // Create reusable transporter object using the default SMTP transport
      const transporter = nodemailer.createTransport(transportOptions);

      // Verify connection configuration
      await transporter.verify();

      // Setup email data
      const mailOptions: any = {
        from,
        to,
        subject,
      };

      if (cc) mailOptions.cc = cc;
      if (bcc) mailOptions.bcc = bcc;

      if (isHtml === 'true' || isHtml === true) {
        mailOptions.html = body;
      } else {
        mailOptions.text = body;
      }

      const files = req.files as Express.Multer.File[];
      if (files && files.length > 0) {
        mailOptions.attachments = files.map(file => ({
          filename: file.originalname,
          content: file.buffer,
        }));
      }

      // Send mail
      const info = await transporter.sendMail(mailOptions);

      res.json({
        success: true,
        message: "Email sent successfully",
        messageId: info.messageId,
        response: info.response,
        envelope: info.envelope,
      });
    } catch (error: any) {
      console.error("Error sending email:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to send email",
        details: error,
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
