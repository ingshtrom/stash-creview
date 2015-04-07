# stash-pullrequest
Pull Request CLI for Atlassian Stash

## Install
```
npm install stash-creview -g
```

## Config
You will need to specify the following environment variables in ~/.profile, ~/.bashrc, or some other file that is loaded when you open your terminal of choice:
``` bash
...
export STASH_CREVIEW_PROTOCOL=http
export STASH_CREVIEW_HOST=stash.company.com
export STASH_CREVIEW_PORT=7990 # this is the default port for stash
export STASH_CREVIEW_USERNAME=username
export STASH_CREVIEW_PASSWORD=password
export STASH_CREVIEW_STATIC_REVIEWERS=bob,bill # OPTIONAL
...
```
You will also need to put a config file (`.creview-config`) in the root of every repo that this program will be used for.  Here is a sample one:
``` json
{
    // these denote 'sections' of your repo
    "sections": [
        {
            // so either bobby or billy can be used as reviewers for 
            // code that is in the 'API' section of the repo
            "key": "API",
            "groupSlug": "stash-group-slug-api"
        },
        {
            "key": "UI",
            "groupSlug": "stash-group-slug-ui"
        },
        {
            "key": "QA",
            "groupSlug": "stash-group-slug-qa"
        }
    ],
    "projectKey": "FOOB",
    "slug": "repo1" // repo slug. should be the same as the repo name.
}
```
For each "groupSlug" specified in the .creview-config file, you will need a Stash group by that name.  It should contain all of the users that could possibly perform a review for that type of pull request.

## Usage
```
creview --help # get help to see all documentation
cd path/to/repo
cd even/deeper # it doesn't matter, where you are in the repo. We'll find the root for you :)
creview -t TICK-1234 -m "Im making a pull request." -s UI # make a pull request that involves only UI code changes
```

## Notes
- this only supports up to 1000 users per group. We could add support for more, but I didn't feel like dealing with paging api's right now.
- the "-s" and "--sections" parameters are no longer required.
- the `STASH_CREVIEW_STATIC_REVIEWERS` env var will limit your random reviewers. A static reviewer CANNOT be one of the randomly selected reviewers.