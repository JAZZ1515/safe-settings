const Diffable = require('./diffable')
const NopCommand = require('../nopcommand')
// it is necessary to use this endpoint until GitHub Enterprise supports
// the modern version under /orgs
const teamRepoEndpoint = '/teams/:team_id/repos/:owner/:repo'
// const teamEndpoint = '/teams/:team_id'
const snooze = ms => new Promise(resolve => setTimeout(resolve, ms))
module.exports = class Teams extends Diffable {
  async find () {
    this.log(`Finding teams for ${this.repo.owner}/${this.repo.repo}`)
    await snooze(2 * 1000)
    return this.github.repos.listTeams(this.repo).then(res => res.data).catch(e => {return []})
  }
  
  comparator (existing, attrs) {
    return existing.slug === attrs.name
  }

  changed (existing, attrs) {
    return existing.permission !== attrs.permission
  }

  update (existing, attrs) {
    if (this.nop) {
      return Promise.resolve([
        new NopCommand(this.constructor.name, this.repo, this.github.request.endpoint(`PUT ${teamRepoEndpoint}`, this.toParams(existing, attrs)),"Add Teams to Repo"),
      ])
    }
    return this.github.request(`PUT ${teamRepoEndpoint}`, this.toParams(existing, attrs))
  }

  add (attrs) {
    let existing = { team_id: 1 }
    this.log(`Getting team with the parms ${JSON.stringify(attrs)}`)
    return this.github.teams.getByName({ org: this.repo.owner, team_slug: attrs.name }).then(res => {
      existing = res.data
      this.log(`adding team ${attrs.name} to ${this.repo.owner}/${this.repo.repo}`)
      if (this.nop) {
        return Promise.resolve([
          new NopCommand(this.constructor.name, this.repo, this.github.teams.addOrUpdateRepoPermissionsInOrg.endpoint(this.toParams(existing, attrs)), "Add Teams to Repo"),
        ])
      }
      return this.github.teams.addOrUpdateRepoPermissionsInOrg(this.toParams(existing, attrs)).then(res => {
        this.log(`team added ${res} to ${this.repo.owner}/${this.repo.repo}`)
      }).catch(e => {
        this.log(`Error adding team to repo ${JSON.stringify(e)} with parms ${JSON.stringify(this.toParams(existing, attrs))}`)
      })
    }).catch(e => {
      if (e.status === 404) {
        let createParam = {
          org: this.repo.owner,
          name: attrs.name
        }
        if(attrs.privacy) {
          createParam.privacy = attrs.privacy
        }
        this.log(`Creating teams ${JSON.stringify(createParam)}`)
        if (this.nop) {
          return Promise.resolve([
            new NopCommand(this.constructor.name, this.repo, this.github.teams.create.endpoint(createParam), "Create Team"),
          ])
        }
        return this.github.teams.create(createParam).then(res => {
          this.log(`team ${createParam.name} created`)
          existing = res.data
          this.log(`adding team ${attrs.name} to ${this.repo.owner}/${this.repo.repo}`)
          return this.github.teams.addOrUpdateRepoPermissionsInOrg(this.toParams(existing, attrs))
        }).catch(e => {
          this.log(`Error adding team ${e}`)
        })
      }
    })
  }

  remove (existing) {
    if (this.nop) {
      return Promise.resolve([
        new NopCommand(this.constructor.name, this.repo, this.github.request(
          `DELETE ${teamRepoEndpoint}`,
          { team_id: existing.id, ...this.repo, org: this.repo.owner }
        ), "DELETE Team"),
      ])
    }
    return this.github.request(
      `DELETE ${teamRepoEndpoint}`,
      { team_id: existing.id, ...this.repo, org: this.repo.owner }
    )
  }

  toParams (existing, attrs) {
    return {
      team_id: existing.id,
      org: this.repo.owner,
      team_slug: attrs.name,
      owner: this.repo.owner,
      repo: this.repo.repo,
      permission: attrs.permission
    }
  }
}
