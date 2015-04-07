#!/usr/bin/env node
'use strict';

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
var hasError = false,
    staticReviewers = (process.env['STASH_CREVIEW_STATIC_REVIEWERS'] || '').split(',');

program
  .version('1.0.0')
  .option('-t, --ticket [id]', 'id of the ticket this is for. e.g. creview -t TICK-1234')
  .option('-m, --message [mes]', 'Message or title of the PR. e.g. creview -m "Fixing it all"')
  .option('-s, --sections [secs]', 'Section of code. Options are defined in your .creview-config file. e.g. creview -s UI,QA')
  .option('-f, --force', 'Force the PR even if the current branch has uncommited changes. You probably don\'t want to do this.')
  .option('-i, --ignore-static-reviewers', 'Ignore any static reviewers specified for this PR only.')
  .parse(process.argv);

if (!program.message) {
    logger.error('A message must be supplied.');
    hasError = true;
}
if (!program.sections) {
    program.sections = '';
}
if (program.ignoreStaticReviewers) {
    staticReviewers = [];
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
            var match;
            logger.debug('current branch', {
                currentBranch: branch.name
            });
            // attempt to determine the ticket
            // number based on the current branch name
            if (!program.ticket) {
                if (!repoConfig.parseBranchRegex) {
                    throw new Error('No ticket number set and the parseBranchRegex was no defined in the .creview-config in your repo root.');
                } else {
                    match = branch.name.match(new RegExp(repoConfig.parseBranchRegex, 'i'));
                    if (!match) {
                        throw new Error('No ticket number set and could not infer the ticket based on the branch name and the parseBranchRegex value in the .creview-config.');
                    }
                    program.ticket = match[0];
                }
            }
            resolve([repoConfig, repoPath, branch, defaultBranch]);
        });
    });
})
.spread(function  (repoConfig, repoPath, currentBranch, defaultBranch) {
    var sections;
    // get reviewers
    sections = program.sections.split(',');
    return [repoConfig, repoPath, currentBranch, defaultBranch, utils.getReviewers(process.env['STASH_CREVIEW_USERNAME'], stash, repoConfig, sections, staticReviewers), sections];
})
.spread(function (repoConfig, repoPath, currentBranch, defaultBranch, reviewers, sections) {
    var pr;
    logger.debug('reviewers found: ', {
        reviewers: reviewers
    });
    
    if (!reviewers || reviewers.length < 1) {
        throw new Error('No reviewers found for ' + program.sections);
    } else if (reviewers && reviewers.length === 1 && reviewers[0] === '__nada__') {
        reviewers = [];
    }

    // add any static reviewers
    _.each(staticReviewers, function (sr) {
        reviewers.push({
            user: {
                name: sr
            }
        });
    });

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
        if (val) {
            result += '[' + val + ']';
        }
    });
    return result + ' ' + ticket + ' - ' + message;
}