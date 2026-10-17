import { createRoom } from './git-room.mjs';

const [command, who, ...args] = process.argv.slice(2);
const room = createRoom();
try {
  let result;
  if (command === 'read') {
    result = await room.events();
    if (who) {
      const { seenEventIds } = await room.checkpoint(who);
      result.events = result.events.filter(event => !seenEventIds.includes(event.id));
    }
  } else if (command === 'say') {
    result = await room.append({ participant: who, text: args[0], ...(args[1] ? { to: args[1] } : {}) });
  } else if (command === 'react') {
    result = await room.append({ participant: who, type: 'reaction', reaction: args[0], replyTo: args[1] });
  } else if (command === 'ack') {
    result = await room.checkpoint(who, args);
  } else throw new Error('Usage: node room/cli.mjs read [participant] | say participant "text" [recipient] | react participant "reaction" event-id | ack participant event-id…');
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
} catch (error) {
  process.stderr.write(error.message + '\n');
  process.exitCode = 1;
}
