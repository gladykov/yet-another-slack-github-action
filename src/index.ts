import { getInput, setOutput } from '@actions/core';
import { context } from '@actions/github';
import { WebClient } from '@slack/web-api';

const allowedStatuses = {
    'success': ['success', 'good', 'pass', 'ok'],
    'failure': ['failure', 'bad', 'fail']
}

type button = {name: string, url: string}

// Retrieve all inputs from action.yaml
const channelId = getInput('CHANNEL_ID');
const token = getInput('TOKEN');
const title = getInput('TITLE');
const status = getInput('STATUS');
const message = getInput('MESSAGE');
const messageSuccess = getInput('MESSAGE_SUCCESS');
const messageFailure = getInput('MESSAGE_FAILURE');
let buttons: button[] = [];
if (getInput('BUTTONS')) {
    buttons = JSON.parse(getInput('BUTTONS'));
}
const elements = getInput('ELEMENTS');
const messageId = getInput('MESSAGE_ID');

// Guard code - validate required inputs
if (!channelId) {
  throw new Error('CHANNEL_ID is required but not provided');
}

if (!token) {
  throw new Error('TOKEN is required but not provided');
}

if (!title) {
  throw new Error('TITLE is required but not provided');
}

if (!status) {
  throw new Error('STATUS is required but not provided');
}

if (![...allowedStatuses.success, ...allowedStatuses.failure].includes(status)) {
    throw new Error(`Provided not recognized status: ${status}`);
}

// Validate that messageSuccess and messageFailure are set together
if ((messageSuccess && !messageFailure) || (!messageSuccess && messageFailure)) {
    throw new Error('messageSuccess and messageFailure must be set together or both left empty');
} else if (!message) {
    throw new Error('You need to setup some message.');
}

// GitHub Actions context variables
const githubRepo = context.repo.repo;
const githubOwner = context.repo.owner;
const githubRef = context.ref;
const githubSha = context.sha;
const githubActor = context.actor;
const githubWorkflow = context.workflow;
const githubJob = context.job;
const githubRunId = context.runId;
const githubRunNumber = context.runNumber;
const githubEventName = context.eventName;
const githubServerUrl = context.payload.repository?.html_url?.replace(`/${githubOwner}/${githubRepo}`, '') || 'https://github.com';
const githubRepoUrl = `${githubServerUrl}/${githubOwner}/${githubRepo}`;
const githubActionUrl = `${githubRepoUrl}/actions/runs/${githubRunId}`;

// Log the retrieved inputs for debugging
// Log the retrieved inputs for debugging
console.log('Retrieved inputs:', {
  channelId,
  token: token ? '***' : '', // Mask token for security
  title,
  status,
  message,
  messageSuccess,
  messageFailure,
  buttons,
  elements,
  messageId
});

// Log GitHub context variables for debugging
console.log('GitHub context variables:', {
  githubRepo,
  githubOwner,
  githubRef,
  githubSha: githubSha.substring(0, 7), // Show only first 7 characters of SHA
  githubActor,
  githubWorkflow,
  githubJob,
  githubRunId,
  githubRunNumber,
  githubEventName,
  githubServerUrl,
  githubRepoUrl,
  githubActionUrl
});

// Initialize Slack WebClient
const slack = new WebClient(token);

console.log('Slack API initialized successfully');

// Determine status-based properties
const isSuccess = allowedStatuses.success.includes(status);
const statusIcon = isSuccess ? ':white_check_mark:' : ':x:';

// Determine which message to use
let finalMessage = message;
if (messageSuccess && messageFailure) {
    finalMessage = isSuccess ? messageSuccess : messageFailure;
}


const blocks: any[] = [
    {
        type: "header",
        text: {
            type: "plain_text",
            text: `${statusIcon} ${title}`
        }
    },
    {
        type: "section",
        text: {
            type: "mrkdwn",
            text: finalMessage || 'No message provided'
        }
    },
    {
        type: "section",
        fields: [
            {
                type: "mrkdwn",
                text: `*Repository:*\n<${githubRepoUrl}|${githubOwner}/${githubRepo}>`
            },
            {
                type: "mrkdwn",
                text: `*Workflow:*\n<${githubActionUrl}|${githubWorkflow} #${githubRunNumber}>`
            }
        ]
    },
]

if (buttons.length > 0) {
    const buttonSection = {
        type: "actions",
        elements: buttons.map(button => ({
            type: "button",
            text: {
                type: "plain_text",
                text: button.name,
            },
            value: button.name,
            url: button.url,
            action_id: button.name
        }))
    };
    blocks.push(buttonSection);
}

blocks.push(    {
    type: "context",
    elements: [
        {
            type: "mrkdwn",
            text: `Actor: ${githubActor} | Ref: ${githubRef} | SHA: ${githubSha.substring(0, 7)}`
        }
    ]
})

// Prepare Slack message payload using Block Kit
const slackMessage = {
    channel: channelId,
    text: `${statusIcon} ${title}`, // Fallback text for notifications
    blocks: blocks
};

// Send or update Slack message
async function sendSlackMessage() {
    try {
        let result;
        if (messageId) {
            // Update existing message
            result = await slack.chat.update({
                ...slackMessage,
                ts: messageId
            });
        } else {
            // Send new message
            result = await slack.chat.postMessage(slackMessage);
        }
        console.log('Slack message sent successfully:', result.ts);
        return result

    } catch (error) {
        console.error('Failed to send Slack message:', error);
        throw new Error(`Failed to send Slack message: ${error}`);
    }
}

// Execute the function
async function main() {
    try {
        const result = await sendSlackMessage();
        setOutput('messageId', result.ts);
    } catch (error) {
        console.error('Action failed:', error);
        process.exit(1);
    }
}

main();
