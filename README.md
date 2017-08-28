# Facebook Post Capture
An automated way to take a fullscreen capture (iPhone 6 viewport simulated) of a facebook post with all its comments

## Requirements
- Node >= 7
- Facebook user credentials

## Authentication
You can either pass your facebook username `FB_USER` and password `FB_PASSWORD` (and eventually the private key `FB_2FA_KEY` for the TOTP code generator if you have 2FA enabled) as environment variables (recommanded) or as arguments in the command line. **Those credentials are required for this script to work!**

## Usage
```
CLI Arguments:
    --url (required)    Permanent link of the facebook post
    --format            jpeg or png. Default: png
    --quality           Quality of the result (number). Default: 100
    --stitch            Stitch all the separated parts into a single screenshot. Default: false
    --maxHeight         Max height of each screenshot. If --stitch is set, this value will be 16384. Default: 16384
    --outputDir         Output directory. Default: './'
    --outputName        Output filename. Default: 'screenshot'
    
    --anonymous         Hide the identity of all involved users (Replace usernames by their abbreviations and blur their profile pictures). Default: false

    --fbuser            This takes precedence over the env variable FB_USER
    --fbpassword        This takes precedence over the env variable FB_PASSWORD
    --fb2fakey          This takes precedence over the env variable FB_2FA_KEY
```

## Example:
Taking screenshot of a New York Times's [post](https://m.facebook.com/story.php?story_fbid=10151276647049999&id=5281959998) and save it to a single file in `jpeg` format, `70%` quality and hide the identity of all involved users:

```bash
$ ./fb.js --fbuser "user@email.com" --fbpass "secret" --fb2fakey "AAAA BBBB CCCC DDDD" --url "https://m.facebook.com/story.php?story_fbid=10151276647049999&id=5281959998" --anonymous --format jpeg --quality 70 --stitch
```

Result:

![Imgur](http://i.imgur.com/DHu1ydt.jpg)