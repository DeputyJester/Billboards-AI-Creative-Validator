import { Resend } from 'resend';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  console.log("Using RESEND_API_KEY:", process.env.RESEND_API_KEY);

  const { boardType, fileData, fileName } = req.body;

  try {
    const response = await resend.emails.send({
      from: 'onboarding@resend.dev', // Use a valid "from" email for your Resend plan
      to: 'deputyjester@gmail.com',
      subject: `New Billboard Submission - ${boardType}`,
      html: `
        <p><strong>New Billboard Artwork Submitted</strong></p>
        <p><strong>Board Type:</strong> ${boardType}</p>
        <p><strong>File Name:</strong> ${fileName}</p>
      `,
      attachments: [
        {
          filename: fileName,
          content: fileData,
        },
      ],
    });

    return res.status(200).json({ message: 'Email sent successfully', response });
  } catch (error) {
    console.error('Email send error:', error);
    return res.status(500).json({ error: 'Email failed to send' });
  }
}
