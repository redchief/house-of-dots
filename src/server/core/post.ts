import { reddit } from '@devvit/web/server';

export const createPost = async () => {
  return await reddit.submitCustomPost({
    title: 'House of Dots — draw lines, steal boxes',
  });
};
