#!/usr/bin/env node

var Promise = require('bluebird'),
    fs = Promise.promisifyAll(require('fs')),
    path = require('path'),
    _ = require('lodash'),
    program = require('commander'),
    utils = require('./utils'),
    logger = require('./logger').logger,
    git = require('gift'),  // bluebird doesn't work with this library
    stashApiModule = require('stash-api'),
    // stashApiModule = require('../../stash-api/src/app'), // for local development
    StashApi = stashApiModule.StashApi,
    PullRequest = stashApiModule.models.PullRequest,
    stash = new StashApi(process.env['STASH_CREVIEW_PROTOCOL'], 
                         process.env['STASH_CREVIEW_HOST'], 
                         process.env['STASH_CREVIEW_PORT'], 
                         process.env['STASH_CREVIEW_USERNAME'], 
                         process.env['STASH_CREVIEW_PASSWORD']);
var hasError = false;

program
  .version('1.0.0')
  .option('-t, --ticket [id]', 'id of the ticket this is for. e.g. creview -t TICK-1234')
  .option('-m, --message [mes]', 'Message or title of the PR. e.g. creview -m "Fixing it all"')
  .option('-s, --sections [secs]', 'Section of code. Options are defined in your .creview-config file. e.g. creview -s UI,QA')
  .option('-f, --force', 'Force the PR even if the current branch has uncommited changes. You probably don\'t want to do this.')
  .parse(process.argv);

if (!program.ticket) {
    logger.error('A ticket must be supplied.');
    hasError = true;
}
if (!program.message) {
    logger.error('A message must be supplied.');
    hasError = true;
}
if (!program.sections) {
    logger.error('At least one section must be supplied.');
    hasError = true;
}

// don't continue if there is any error with the input
if (hasError) {
    return;
}

// git repo root path => git rev-parse --show-toplevel
utils.getRepoRoot()
.then(function (repoPath) {
    logger.debug('got a repo root', {
        root: repoPath
    });
    return [
        fs.readFileAsync(path.join(repoPath + '/.creview-config')).then(function(result) { return JSON.parse(result, 'utf8'); }),
        repoPath
    ];
})
// verify our current status is clean!
.spread(function (repoConfig, repoPath) {
    return new Promise(function (resolve, reject) {
        git(repoPath)
        .status(function (err, status) {
            var errorMessage = 'Your current branch is not clean. You can overide this message with the -f flag. Exiting now...'; 
            if (err) {
                throw new Error('An error ocurred while getting the status of the repo.');
            }
            if (!status.clean && !program.force) {
                reject(errorMessage);
            }
            resolve([repoConfig, repoPath]);
        });
    });
})
// get the default branch
.spread(function (repoConfig, repoPath) {
    // branch that the current branch should request a pull from => config file at repo root, the default parent repo?
    // can override with CLI param
    var defaultBranchPromise = stash.getDefaultBranch(repoConfig.projectKey, repoConfig.slug)
    .spread(function (response, body) {
        if (response.statusCode !== 200) {
            logger.debug('getDefaultBranch', {
                response: response
            });
            throw new Error('Error while getting the default branch');
        }
        logger.debug('default branch', {
            branchJSON: body
        });
        return body;
    });
    return [repoConfig, repoPath, defaultBranchPromise];
})
.spread(function (repoConfig, repoPath, defaultBranch) {
    // current branch => https://www.npmjs.com/package/gift#repobranchbranch-callback
    return new Promise(function (resolve) {
        git(repoPath)
        .branch(function (err, branch) {
            logger.debug('current branch', {
                currentBranch: branch.name
            });
            resolve([repoConfig, repoPath, branch, defaultBranch]);
        });
    });
})
.spread(function  (repoConfig, repoPath, currentBranch, defaultBranch) {
    var reviewers, sections, pr;
    // get reviewers
    sections = program.sections.split(',');
    return [repoConfig, repoPath, currentBranch, defaultBranch, utils.getReviewers(process.env['STASH_CREVIEW_USERNAME'], stash, repoConfig, sections), sections];
})
.spread(function (repoConfig, repoPath, currentBranch, defaultBranch, reviewers, sections) {
    logger.debug('reviewers found: ', {
        reviewers: reviewers
    });
    
    if (!reviewers || reviewers.length < 1) {
        throw new Error('No reviewers found for ' + program.sections);
    }
    
    // create PR
    pr = new PullRequest();
    pr.title = generateTitle(sections, program.ticket, program.message);
    pr.reviewers = reviewers;
    pr.fromRef = {
        id: 'refs/heads/' + currentBranch.name,
        repository: {
            slug: repoConfig.slug,
            project: {
                key: repoConfig.projectKey
            }
        }
    };

    pr.toRef = {
        id: defaultBranch.id,
        repository: {
            slug: repoConfig.slug,
            project: {
                key: repoConfig.projectKey
            }
        }
    };
    stash.createPullRequest(repoConfig.projectKey, repoConfig.slug, pr)
    .spread(function (response, body) {
        if (response.statusCode === 201) {
            logger.info('successfully created pull request');
            // open chrome on the user's machine to the PR url
        } else {
            logger.error('boooooo, error while creating pull request', {
                body: body,
                statusCode: response.statusCode
            });
        }
    });
})
.catch(function (err) {
    logger.error('error in main: ' + err);
});

function generateTitle (sections, ticket, message) {
    var result = '';
    _.each(sections, function (val) {
        result += '[' + val + ']';
    });
    return result + ' ' + ticket + ' - ' + message;
}