import type { Metadata } from "next";

import styles from "./privacy.module.css";

export const metadata: Metadata = {
  title: "ISE AI Service Privacy Policy",
  description:
    "Privacy information for the ISE AI Service operated by the International School of Engineering, Chulalongkorn University.",
};

const LAST_UPDATED = "19 October 2026";

export default function PrivacyPolicyPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <p className={styles.brand}>ISE AI Service</p>
          <h1>Privacy Policy</h1>
          <p className={styles.intro}>
            This policy explains how the International School of Engineering
            (ISE), Chulalongkorn University handles information when people use
            the ISE AI Service through its website, chat services, LINE, or
            Facebook Messenger.
          </p>
          <p className={styles.updated}>Last updated: {LAST_UPDATED}</p>
        </div>
      </header>

      <article className={styles.content}>
        <section>
          <h2>About this service</h2>
          <p>
            ISE AI Service provides AI-assisted information and support about
            ISE. Depending on the configured response mode and the nature of a
            question, the service may answer automatically, prepare a suggested
            reply for staff, or refer the conversation for staff assistance.
          </p>
          <p>
            External channels such as LINE and Facebook Messenger are intended
            to use public ISE knowledge. Internal restricted knowledge is not
            intended to be exposed through these public channels.
          </p>
        </section>

        <section>
          <h2>Information we may process</h2>
          <p>
            The information processed depends on the channel and features that
            you use. It may include:
          </p>
          <ul>
            <li>Messages and questions that you submit to the service.</li>
            <li>
              Platform identifiers, such as a LINE user ID, Facebook Page-scoped
              user ID (PSID), or an equivalent channel identifier.
            </li>
            <li>
              Message timestamps and limited conversation metadata, including
              conversation status, response mode, and delivery or processing
              state.
            </li>
            <li>
              Attachments or images when a supported messaging channel allows
              them and you choose to send them.
            </li>
            <li>
              AI-generated suggested replies, sanitized analysis results, and
              records showing whether a conversation is awaiting or receiving
              staff assistance.
            </li>
            <li>
              Technical, error, and security logs needed to operate, diagnose,
              and protect the service.
            </li>
          </ul>
        </section>

        <section>
          <h2>How we use information</h2>
          <p>Information may be used to:</p>
          <ul>
            <li>Answer questions about ISE and its public information.</li>
            <li>Provide AI-assisted customer and student support.</li>
            <li>Prepare suggested replies for review by authorized staff.</li>
            <li>Enable staff follow-up and maintain conversation continuity.</li>
            <li>Detect errors, investigate incidents, and protect the service.</li>
            <li>Maintain and improve service operations.</li>
          </ul>
          <p>
            The service does not intentionally use conversation data for
            unsolicited advertising or user profiling.
          </p>
        </section>

        <section>
          <h2>AI-assisted and staff-assisted responses</h2>
          <p>
            Selected conversation content may be sent to approved cloud or AI
            service providers that help operate the service. Those providers may
            process the content under their applicable service terms and data
            handling practices. ISE staff may also review messages, suggested
            replies, and conversation history when staff assistance is requested
            or operational review is needed.
          </p>
          <p>
            AI-generated responses may be incomplete or inaccurate. Users should
            verify important academic, admission, or administrative information
            through official ISE channels.
          </p>
        </section>

        <section>
          <h2>Images and media</h2>
          <p>
            On supported messaging channels, an image may be fetched temporarily
            from the platform so that the service can analyze it. The application
            does not intentionally persist raw image bytes or base64 image data.
            It may store minimal attachment metadata and a sanitized description
            or analysis result that is useful for the conversation.
          </p>
          <p>
            Sensitive identifiers are filtered or redacted where possible.
            Text extracted from identity-document images is not retained as
            free-form conversation context. Messaging platforms and approved
            service providers may apply their own processing and retention terms.
          </p>
        </section>

        <section>
          <h2>LINE</h2>
          <p>
            When you contact an official ISE account through LINE, your messages
            and, where supported, images may be processed to provide the service.
            LINE platform identifiers may be used to associate messages with the
            correct account and maintain conversation continuity.
          </p>
        </section>

        <section>
          <h2>Facebook Messenger</h2>
          <p>
            Facebook Messenger messages are processed only after a user initiates
            or participates in a conversation with the connected ISE Page. A
            Page-scoped user identifier may be used to maintain conversation
            continuity and route replies to the correct conversation.
          </p>
          <p>
            Messenger data is not intentionally used for unsolicited advertising.
            Users may request deletion of their conversation data through ISE&apos;s
            official contact channels.
          </p>
        </section>

        <section>
          <h2>Retention and security</h2>
          <p>
            Conversation records may be retained for operational, support, audit,
            and security purposes. Retention periods may vary according to
            institutional, legal, and operational requirements. Information
            should be deleted or anonymized when it is no longer necessary,
            subject to applicable requirements.
          </p>
          <p>
            ISE applies reasonable technical and organizational safeguards to
            limit access and protect service information. No internet or cloud
            service can guarantee absolute security.
          </p>
        </section>

        <section>
          <h2>Your privacy choices and requests</h2>
          <p>
            Subject to applicable law, you may ask about access to, correction
            of, or deletion of your personal data, or request objection or
            restriction of processing where applicable. You may also raise a
            privacy concern about the service.
          </p>
          <p>
            Please contact the International School of Engineering through its
            official contact channels. ISE may need information sufficient to
            locate the relevant conversation and verify the request.
          </p>
        </section>

        <section id="data-deletion-requests">
          <h2>Data Deletion Requests</h2>
          <p>
            To request deletion of conversation data associated with the ISE AI
            Service, including a LINE or Facebook Messenger conversation, contact
            the International School of Engineering through its official contact
            channels and state that the request concerns ISE AI Service data
            deletion.
          </p>
          <p>
            ISE will review the request and may ask for limited information needed
            to identify the relevant record and confirm that the requester is
            entitled to make the request. Some records may need to be retained
            where required for legal, audit, security, or institutional purposes.
          </p>
        </section>

        <section>
          <h2>University privacy information</h2>
          <p>
            For additional information, see the{" "}
            <a
              href="https://www.chula.ac.th/en/personal-data-protection-policy/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Chulalongkorn University guidelines for personal data protection
            </a>
            .
          </p>
        </section>

        <section>
          <h2>Policy updates</h2>
          <p>
            This policy may be updated when the service, institutional practices,
            or applicable requirements change. The revision date at the top of
            this page identifies the current published version.
          </p>
        </section>
      </article>

      <footer className={styles.footer}>
        <p>ISE AI Service</p>
        <p>International School of Engineering (ISE), Chulalongkorn University</p>
        <p>Last updated: {LAST_UPDATED}</p>
      </footer>
    </main>
  );
}
